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
    try {
      const macosPackageFilename = 'Comp AI Agent-1.0.0-arm64.dmg';
      const packageKey = `${DEVICE_AGENT_PREFIX}/macos/${macosPackageFilename}`;

      this.logger.log(`Downloading macOS agent from object storage: ${packageKey}`);

      const objectStream = objectStorage.streamObject({
        organizationId: 'device-agent',
        key: packageKey,
        bucketName: this.bucketName,
      });

      this.logger.log(
        `Successfully retrieved macOS agent: ${macosPackageFilename}`,
      );

      return {
        stream: objectStream,
        filename: macosPackageFilename,
        contentType: 'application/x-apple-diskimage',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to download macOS agent from object storage:', error);
      if (isMissingObjectError(error)) {
        throw new NotFoundException('macOS agent file not found');
      }
      throw new InternalServerErrorException(
        'Failed to download macOS agent. The agent file may not be available in this environment.',
      );
    }
  }

  async downloadWindowsAgent(): Promise<{
    stream: Readable;
    filename: string;
    contentType: string;
  }> {
    try {
      const windowsPackageFilename = 'Comp AI Agent 1.0.0.exe';
      const packageKey = `${DEVICE_AGENT_PREFIX}/windows/${windowsPackageFilename}`;

      this.logger.log(`Downloading Windows agent from object storage: ${packageKey}`);

      const objectStream = objectStorage.streamObject({
        organizationId: 'device-agent',
        key: packageKey,
        bucketName: this.bucketName,
      });

      this.logger.log(
        `Successfully retrieved Windows agent: ${windowsPackageFilename}`,
      );

      return {
        stream: objectStream,
        filename: windowsPackageFilename,
        contentType: 'application/octet-stream',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to download Windows agent from object storage:', error);
      if (isMissingObjectError(error)) {
        throw new NotFoundException('Windows agent file not found');
      }
      throw new InternalServerErrorException(
        'Failed to download Windows agent. The agent file may not be available in this environment.',
      );
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
      return { kind: 'redirect', url: await this.signUpdateUrl(key, 'GET') };
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

    if (REDIRECT_EXTENSIONS.has(ext)) {
      // S3 signs each HTTP method separately — a GET-signed URL is rejected
      // for HEAD with SignatureDoesNotMatch.
      return { kind: 'redirect', url: await this.signUpdateUrl(key, 'HEAD') };
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
        contentType,
        contentLength: metadata.contentLength,
      };
    } catch {
      throw new NotFoundException('Not found');
    }
  }

  private async signUpdateUrl(
    key: string,
    method: 'GET' | 'HEAD',
  ): Promise<string> {
    return objectStorage.getSignedObjectUrl({
      organizationId: 'device-agent',
      key,
      bucketName: this.bucketName,
      action: 'read',
      expiresInSeconds: PRESIGNED_URL_TTL_SECONDS,
    });
  }
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { name?: string; code?: unknown };
  return (
    maybeError.name === 'NoSuchKey' ||
    maybeError.name === 'NotFound' ||
    maybeError.code === 404
  );
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
  | { kind: 'stream'; contentType: string; contentLength?: number }
  | { kind: 'redirect'; url: string };
