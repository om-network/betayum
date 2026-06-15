import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  getDeviceAgentArtifactsBucketName,
  objectStorage,
} from '@/app/object-storage';
import { isMissingObjectError } from '@/app/object-storage-errors';
import { Readable } from 'stream';

const DEVICE_AGENT_STORAGE_ENV =
  process.env.DEVICE_AGENT_STORAGE_ENV ||
  process.env.DEVICE_AGENT_S3_ENV ||
  'production';
const DEVICE_AGENT_PREFIX = `device-agent/${DEVICE_AGENT_STORAGE_ENV}`;
const DEVICE_AGENT_UPDATES_PREFIX = `${DEVICE_AGENT_PREFIX}/updates`;

const ALLOWED_EXTENSIONS = new Set([
  '.yml',
  '.zip',
  '.exe',
  '.blockmap',
  '.AppImage',
  '.dmg',
]);

const CONTENT_TYPES: Record<string, string> = {
  '.yml': 'text/yaml',
  '.zip': 'application/zip',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.AppImage': 'application/octet-stream',
  '.dmg': 'application/x-apple-diskimage',
};
const REDIRECT_EXTENSIONS = new Set([
  '.zip',
  '.exe',
  '.blockmap',
  '.AppImage',
  '.dmg',
]);

const PRESIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const DIRECT_DOWNLOAD_TARGETS = {
  macos: {
    key: `${DEVICE_AGENT_PREFIX}/macos/latest-arm64.dmg`,
    filename: 'CompAI-Device-Agent-arm64.dmg',
    contentType: 'application/x-apple-diskimage',
  },
  windows: {
    key: `${DEVICE_AGENT_PREFIX}/windows/latest-setup.exe`,
    filename: 'CompAI-Device-Agent-setup.exe',
    contentType: 'application/octet-stream',
  },
} as const;

function getExtension(filename: string): string {
  if (filename.endsWith('.AppImage')) return '.AppImage';
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex) : '';
}

function isValidFilename(filename: string): boolean {
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    return false;
  }
  return ALLOWED_EXTENSIONS.has(getExtension(filename));
}

@Injectable()
export class DeviceAgentService {
  private readonly logger = new Logger(DeviceAgentService.name);

  private get bucketName(): string {
    const bucketName = getDeviceAgentArtifactsBucketName();
    if (bucketName) return bucketName;
    throw new InternalServerErrorException(
      'Object storage bucket is not configured for device agent downloads.',
    );
  }

  async downloadMacAgent(): Promise<{
    stream: Readable;
    filename: string;
    contentType: string;
  }> {
    return this.downloadDirectInstaller({
      label: 'macOS',
      target: DIRECT_DOWNLOAD_TARGETS.macos,
      notFoundMessage: 'macOS agent file not found',
      failureMessage:
        'Failed to download macOS agent. The agent file may not be available in this environment.',
    });
  }

  async downloadWindowsAgent(): Promise<{
    stream: Readable;
    filename: string;
    contentType: string;
  }> {
    return this.downloadDirectInstaller({
      label: 'Windows',
      target: DIRECT_DOWNLOAD_TARGETS.windows,
      notFoundMessage: 'Windows agent file not found',
      failureMessage:
        'Failed to download Windows agent. The agent file may not be available in this environment.',
    });
  }

  private async downloadDirectInstaller({
    label,
    target,
    notFoundMessage,
    failureMessage,
  }: {
    label: string;
    target: (typeof DIRECT_DOWNLOAD_TARGETS)[keyof typeof DIRECT_DOWNLOAD_TARGETS];
    notFoundMessage: string;
    failureMessage: string;
  }): Promise<{
    stream: Readable;
    filename: string;
    contentType: string;
  }> {
    try {
      this.logger.log(
        `Downloading ${label} agent from object storage: ${target.key}`,
      );

      await objectStorage.getObjectMetadata({
        organizationId: 'device-agent',
        key: target.key,
        bucketName: this.bucketName,
      });

      const objectStream = objectStorage.streamObject({
        organizationId: 'device-agent',
        key: target.key,
        bucketName: this.bucketName,
      });

      this.logger.log(
        `Successfully retrieved ${label} agent: ${target.filename}`,
      );

      return {
        stream: objectStream,
        filename: target.filename,
        contentType: target.contentType,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to download ${label} agent from object storage:`,
        error,
      );
      if (isMissingObjectError(error)) {
        throw new NotFoundException(notFoundMessage);
      }
      throw new InternalServerErrorException(failureMessage);
    }
  }

  async getUpdateFile({
    filename,
  }: {
    filename: string;
  }): Promise<UpdateFileResult> {
    if (!isValidFilename(filename)) {
      throw new NotFoundException('Not found');
    }

    const key = `${DEVICE_AGENT_UPDATES_PREFIX}/${filename}`;
    const ext = getExtension(filename);

    if (REDIRECT_EXTENSIONS.has(ext)) {
      return { kind: 'redirect', url: await this.signUpdateUrl(key) };
    }

    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    try {
      const metadata = await objectStorage.getObjectMetadata({
        organizationId: 'device-agent',
        key,
        bucketName: this.bucketName,
      });

      return {
        kind: 'stream',
        stream: objectStorage.streamObject({
          organizationId: 'device-agent',
          key,
          bucketName: this.bucketName,
        }),
        contentType,
        contentLength: metadata.contentLength,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (isMissingObjectError(error)) {
        throw new NotFoundException('Not found');
      }
      this.logger.error('Error serving update file:', { key, error });
      throw new InternalServerErrorException('Internal server error');
    }
  }

  async headUpdateFile({
    filename,
  }: {
    filename: string;
  }): Promise<HeadUpdateFileResult> {
    if (!isValidFilename(filename)) {
      throw new NotFoundException('Not found');
    }

    const key = `${DEVICE_AGENT_UPDATES_PREFIX}/${filename}`;
    const ext = getExtension(filename);
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    try {
      const metadata = await objectStorage.getObjectMetadata({
        organizationId: 'device-agent',
        key,
        bucketName: this.bucketName,
      });

      return {
        kind: 'metadata',
        contentType,
        contentLength: metadata.contentLength,
      };
    } catch {
      throw new NotFoundException('Not found');
    }
  }

  private async signUpdateUrl(key: string): Promise<string> {
    return objectStorage.getSignedObjectUrl({
      organizationId: 'device-agent',
      key,
      bucketName: this.bucketName,
      action: 'read',
      expiresInSeconds: PRESIGNED_URL_TTL_SECONDS,
    });
  }
}

export type UpdateFileResult =
  | {
      kind: 'stream';
      stream: Readable;
      contentType: string;
      contentLength?: number;
    }
  | { kind: 'redirect'; url: string };

export type HeadUpdateFileResult =
  | { kind: 'metadata'; contentType: string; contentLength?: number }
  | { kind: 'redirect'; url: string };
