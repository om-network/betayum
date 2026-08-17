import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CodexAutomationRunStatus, db } from '@db';
import { wait } from '@trigger.dev/sdk';
import { createHash, randomBytes } from 'node:crypto';
import { objectStorage } from '../../app/object-storage';
import { BrowserVmLifecycleService } from '../../integration-browser/browser-vm-lifecycle.service';
import { CodexSshService } from '../../integration-browser/codex-ssh.service';
import type {
  CodexScreenshotReferenceDto,
  CompleteCodexAutomationRunDto,
  CreateCodexAutomationRunDto,
  UploadCodexScreenshotDto,
} from './dto/codex-automation.dto';
import {
  MAX_SCREENSHOTS_TOTAL_BYTES,
  validateScreenshot,
} from './codex-automation-validation';
import { promoteCodexAutomationScreenshots } from './codex-automation-promotion';
import {
  expireStaleCodexAutomationRuns,
  reconcileCodexAutomation,
} from './codex-automation-reconciliation';

const CAPABILITY_LIFETIME_MS = 30 * 60 * 1000;

@Injectable()
export class CodexAutomationService {
  constructor(
    private readonly browserVms: BrowserVmLifecycleService,
    private readonly codexSsh: CodexSshService,
  ) {}

  async createRun({
    automationId,
    dto,
    organizationId,
    taskId,
  }: {
    automationId: string;
    dto: CreateCodexAutomationRunDto;
    organizationId: string;
    taskId: string;
  }) {
    const automation = await db.evidenceAutomation.findFirst({
      where: { id: automationId, taskId, task: { organizationId } },
      select: { id: true },
    });
    if (!automation) throw new NotFoundException('Automation not found');

    await expireStaleCodexAutomationRuns({ organizationId });

    const browserVm = await this.browserVms.ensureVm(organizationId);
    const capabilityToken = randomBytes(32).toString('base64url');
    const run = await db.codexAutomationRun.create({
      data: {
        automationId,
        browserVmId: browserVm.id,
        capabilityExpiresAt: new Date(Date.now() + CAPABILITY_LIFETIME_MS),
        capabilityTokenHash: this.hashToken(capabilityToken),
        evidenceDescription: dto.evidenceDescription,
        organizationId,
        prompt: dto.prompt,
        taskId,
        triggerRunId: dto.triggerRunId,
        triggerWaitpointId: dto.triggerWaitpointId,
      },
    });

    const apiBaseUrl = this.requiredConfig('CODEX_AUTOMATION_API_BASE_URL');
    void this.codexSsh
      .getStatus(browserVm)
      .then((loggedIn) => {
        if (!loggedIn) {
          throw new ServiceUnavailableException(
            'Codex is not logged in on the browser VM',
          );
        }
        return this.codexSsh.runAutomation({
          vm: browserVm,
          request: {
            apiBaseUrl,
            capabilityToken,
            evidenceDescription: dto.evidenceDescription,
            prompt: dto.prompt,
            runId: run.id,
          },
        });
      })
      .then(() =>
        db.codexAutomationRun.updateMany({
          where: { id: run.id, status: CodexAutomationRunStatus.pending },
          data: { status: CodexAutomationRunStatus.dispatched },
        }),
      )
      .catch(async (error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'VM dispatch failed';
        await db.codexAutomationRun.update({
          where: { id: run.id },
          data: {
            completedAt: new Date(),
            errorMessage: message,
            status: CodexAutomationRunStatus.failed,
          },
        });
        await reconcileCodexAutomation({
          automationId,
          message,
          runId: run.id,
          successful: false,
        });
      });

    return { runId: run.id, status: run.status };
  }

  async getRun({
    organizationId,
    runId,
    taskId,
  }: {
    organizationId: string;
    runId: string;
    taskId: string;
  }) {
    const run = await db.codexAutomationRun.findFirst({
      where: { id: runId, organizationId, taskId },
      include: { screenshots: true },
    });
    if (!run) throw new NotFoundException('Codex automation run not found');
    return run;
  }

  async uploadScreenshot({
    authorization,
    dto,
    runId,
  }: {
    authorization: string | undefined;
    dto: UploadCodexScreenshotDto;
    runId: string;
  }) {
    const run = await this.requireCapability({ authorization, runId });
    const bytes = Buffer.from(dto.fileData, 'base64');
    const validated = validateScreenshot({
      bytes,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
    });
    const aggregate = await db.codexAutomationScreenshot.aggregate({
      where: { runId },
      _sum: { sizeBytes: true },
      _count: true,
    });
    if (
      aggregate._count >= 10 ||
      (aggregate._sum.sizeBytes ?? 0) + bytes.length >
        MAX_SCREENSHOTS_TOTAL_BYTES
    ) {
      throw new BadRequestException('Screenshot evidence limit exceeded');
    }

    const generatedName = `${randomBytes(16).toString('hex')}.${validated.extension}`;
    const objectKey = `${run.organizationId}/automation-runs/${run.id}/screenshots/${generatedName}`;
    const location = await objectStorage.uploadObject({
      organizationId: run.organizationId,
      key: objectKey,
      body: bytes,
      contentType: dto.mimeType,
      metadata: { checksumSha256: validated.checksumSha256, runId },
    });
    await db.codexAutomationScreenshot.create({
      data: {
        checksumSha256: validated.checksumSha256,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        runId,
        sizeBytes: bytes.length,
        stagedObjectKey: location.key,
      },
    });
    return {
      checksumSha256: validated.checksumSha256,
      mimeType: dto.mimeType,
      objectKey: location.key,
      sizeBytes: bytes.length,
    };
  }

  async completeRun({
    authorization,
    dto,
    runId,
  }: {
    authorization: string | undefined;
    dto: CompleteCodexAutomationRunDto;
    runId: string;
  }) {
    const run = await this.requireCapability({ authorization, runId });
    this.validateReferences(run.screenshots, dto.screenshots);
    if (
      run.status === CodexAutomationRunStatus.completed ||
      run.status === CodexAutomationRunStatus.promoting ||
      run.status === CodexAutomationRunStatus.promoted
    ) {
      if (run.summary !== dto.summary) {
        throw new ConflictException('Conflicting run completion');
      }
      if (run.triggerWaitpointId) {
        await wait.completeToken(run.triggerWaitpointId, {
          runId: run.id,
          summary: run.summary,
        });
      }
      return { accepted: true };
    }
    if (
      run.status !== CodexAutomationRunStatus.pending &&
      run.status !== CodexAutomationRunStatus.dispatched
    ) {
      throw new ConflictException('Conflicting run completion');
    }
    const updated = await db.codexAutomationRun.updateMany({
      where: {
        id: run.id,
        status: {
          in: [
            CodexAutomationRunStatus.pending,
            CodexAutomationRunStatus.dispatched,
          ],
        },
      },
      data: {
        completedAt: new Date(),
        status: CodexAutomationRunStatus.completed,
        summary: dto.summary,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('Run completion is already being processed');
    }
    if (!run.triggerWaitpointId) {
      const output = await promoteCodexAutomationScreenshots({
        organizationId: run.organizationId,
        runId: run.id,
      });
      return { accepted: true, output };
    }
    await wait.completeToken(run.triggerWaitpointId, {
      runId: run.id,
      summary: dto.summary,
    });
    return { accepted: true };
  }

  private async requireCapability({
    authorization,
    runId,
  }: {
    authorization: string | undefined;
    runId: string;
  }) {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Run capability required');
    const run = await db.codexAutomationRun.findFirst({
      where: { id: runId, capabilityTokenHash: this.hashToken(token) },
      include: { screenshots: true },
    });
    if (!run || run.capabilityExpiresAt <= new Date()) {
      throw new UnauthorizedException('Run capability is invalid or expired');
    }
    return run;
  }

  private validateReferences(
    stored: Array<{
      checksumSha256: string;
      mimeType: string;
      sizeBytes: number;
      stagedObjectKey: string;
    }>,
    supplied: CodexScreenshotReferenceDto[],
  ): void {
    const expected = new Map(
      stored.map((item) => [item.stagedObjectKey, item]),
    );
    if (expected.size !== supplied.length) {
      throw new BadRequestException('Screenshot list does not match uploads');
    }
    for (const item of supplied) {
      const match = expected.get(item.objectKey);
      if (
        !match ||
        match.checksumSha256 !== item.checksumSha256 ||
        match.mimeType !== item.mimeType ||
        match.sizeBytes !== item.sizeBytes
      ) {
        throw new BadRequestException(
          'Screenshot metadata does not match upload',
        );
      }
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private requiredConfig(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  }
}
