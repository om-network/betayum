import { Storage, type GetSignedUrlConfig } from '@google-cloud/storage';
import type { Readable } from 'node:stream';
import '../config/load-env';

type SignedUrlAction = 'read' | 'write' | 'delete' | 'resumable';

export type ObjectLocation = {
  bucketName: string;
  key: string;
};

export type ResolveObjectLocationParams = {
  organizationId: string;
  key: string;
  bucketName?: string;
};

export type UploadObjectParams = ResolveObjectLocationParams & {
  body: Buffer | string | Uint8Array;
  contentType?: string;
};

export type DeleteObjectParams = ResolveObjectLocationParams;

export type StreamObjectParams = ResolveObjectLocationParams;

export type SignedObjectUrlParams = ResolveObjectLocationParams & {
  action: SignedUrlAction;
  expiresInSeconds?: number;
  contentType?: string;
  responseContentDisposition?: string;
  responseContentType?: string;
};

export interface ObjectStorage {
  uploadObject(params: UploadObjectParams): Promise<ObjectLocation>;
  streamObject(params: StreamObjectParams): Readable;
  deleteObject(params: DeleteObjectParams): Promise<void>;
  getSignedObjectUrl(params: SignedObjectUrlParams): Promise<string>;
}

type StorageClient = {
  bucket(name: string): StorageBucket;
};

type StorageBucket = {
  file(key: string): StorageFile;
};

type StorageFile = {
  save(
    body: Buffer | string | Uint8Array,
    options: {
      resumable: false;
      metadata?: { contentType?: string };
    },
  ): Promise<void>;
  createReadStream(): Readable;
  delete(): Promise<unknown>;
  getSignedUrl(config: GetSignedUrlConfig): Promise<[string]>;
};

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.map(normalizeEnvValue).find(Boolean);
}

function getDefaultBucketName(): string | undefined {
  return firstDefined(
    process.env.APP_OBJECT_STORAGE_BUCKET,
    process.env.APP_GCS_BUCKET_NAME,
    process.env.APP_GCP_BUCKET_NAME,
    process.env.APP_AWS_BUCKET_NAME,
  );
}

export function validateObjectKey(key: string): string {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Object key cannot be empty');
  }

  const normalizedKey = key.trim().replace(/^\/+/, '');
  const lowerKey = normalizedKey.toLowerCase();

  if (
    lowerKey.includes('://') ||
    lowerKey.includes('storage.googleapis.com') ||
    lowerKey.includes('amazonaws.com')
  ) {
    throw new Error('Object key must not be a URL');
  }

  const segments = normalizedKey.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Path traversal detected in object key');
  }

  return normalizedKey;
}

export function resolveObjectLocation({
  organizationId,
  key,
  bucketName,
}: ResolveObjectLocationParams): ObjectLocation {
  const resolvedBucketName = normalizeEnvValue(bucketName) ?? getDefaultBucketName();

  if (!resolvedBucketName) {
    throw new Error('Object storage bucket is not configured');
  }

  const normalizedOrganizationId = normalizeEnvValue(organizationId);
  if (!normalizedOrganizationId) {
    throw new Error('Organization id is required for object storage');
  }

  const normalizedKey = validateObjectKey(key);
  const organizationPrefix = `${normalizedOrganizationId}/`;

  if (normalizedKey.startsWith('org_') && !normalizedKey.startsWith(organizationPrefix)) {
    throw new Error(`Object key must be scoped to organization ${normalizedOrganizationId}`);
  }

  return {
    bucketName: resolvedBucketName,
    key: normalizedKey.startsWith(organizationPrefix)
      ? normalizedKey
      : `${organizationPrefix}${normalizedKey}`,
  };
}

function getDeleteErrorCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const maybeError = error as Error & { code?: unknown };
  return typeof maybeError.code === 'number' ? maybeError.code : undefined;
}

export class GcsObjectStorage implements ObjectStorage {
  constructor(private readonly storage: StorageClient = new Storage()) {}

  async uploadObject(params: UploadObjectParams): Promise<ObjectLocation> {
    const location = resolveObjectLocation(params);
    const file = this.storage.bucket(location.bucketName).file(location.key);
    await file.save(params.body, {
      resumable: false,
      metadata: params.contentType
        ? { contentType: params.contentType }
        : undefined,
    });

    return location;
  }

  streamObject(params: StreamObjectParams): Readable {
    const location = resolveObjectLocation(params);
    return this.storage
      .bucket(location.bucketName)
      .file(location.key)
      .createReadStream();
  }

  async deleteObject(params: DeleteObjectParams): Promise<void> {
    const location = resolveObjectLocation(params);

    try {
      await this.storage.bucket(location.bucketName).file(location.key).delete();
    } catch (error) {
      if (getDeleteErrorCode(error) === 404) {
        return;
      }

      throw error;
    }
  }

  async getSignedObjectUrl(params: SignedObjectUrlParams): Promise<string> {
    const location = resolveObjectLocation(params);
    const expiresInSeconds = params.expiresInSeconds ?? 900;
    const config: GetSignedUrlConfig = {
      version: 'v4',
      action: params.action,
      expires: Date.now() + expiresInSeconds * 1000,
      contentType: params.contentType,
      responseDisposition: params.responseContentDisposition,
      responseType: params.responseContentType,
    };
    const [url] = await this.storage
      .bucket(location.bucketName)
      .file(location.key)
      .getSignedUrl(config);

    return url;
  }
}

export const objectStorage: ObjectStorage = new GcsObjectStorage();
