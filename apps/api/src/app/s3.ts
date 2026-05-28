import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl as _getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';
import '../config/load-env';

/**
 * Re-export getSignedUrl with a type workaround for duplicate @smithy/types.
 * Bun/Docker installs separate @smithy/types copies for @aws-sdk/client-s3
 * and @aws-sdk/s3-request-presigner even when pinned to the same version.
 * The runtime types are fully compatible — only the TypeScript class identity differs.
 */
export const getSignedUrl = _getSignedUrl as unknown as (
  client: S3Client,
  command: GetObjectCommand | PutObjectCommand,
  options?: { expiresIn?: number },
) => Promise<string>;

const logger = new Logger('S3');

const GCP_STORAGE_DEFAULT_ENDPOINT = 'https://storage.googleapis.com';

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

const hasGcpStorageEnv = [
  process.env.APP_GCP_ACCESS_KEY_ID,
  process.env.APP_GCP_SECRET_ACCESS_KEY,
  process.env.APP_GCP_BUCKET_NAME,
  process.env.APP_GCP_ENDPOINT,
].some(isNonEmptyString);

export const STORAGE_PROVIDER = hasGcpStorageEnv ? 'gcp' : 'aws';
export const STORAGE_REGION =
  process.env.APP_GCP_REGION ||
  process.env.APP_AWS_REGION ||
  (STORAGE_PROVIDER === 'gcp' ? 'auto' : 'us-east-1');
export const STORAGE_ACCESS_KEY_ID =
  process.env.APP_GCP_ACCESS_KEY_ID || process.env.APP_AWS_ACCESS_KEY_ID;
export const STORAGE_SECRET_ACCESS_KEY =
  process.env.APP_GCP_SECRET_ACCESS_KEY ||
  process.env.APP_AWS_SECRET_ACCESS_KEY;
export const STORAGE_ENDPOINT =
  process.env.APP_GCP_ENDPOINT ||
  process.env.APP_AWS_ENDPOINT ||
  (STORAGE_PROVIDER === 'gcp' ? GCP_STORAGE_DEFAULT_ENDPOINT : undefined);

export const BUCKET_NAME =
  process.env.APP_GCP_BUCKET_NAME || process.env.APP_AWS_BUCKET_NAME;
export const APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET =
  process.env.APP_GCP_QUESTIONNAIRE_UPLOAD_BUCKET ||
  process.env.APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET;
export const APP_AWS_KNOWLEDGE_BASE_BUCKET =
  process.env.APP_GCP_KNOWLEDGE_BASE_BUCKET ||
  process.env.APP_AWS_KNOWLEDGE_BASE_BUCKET;
export const APP_AWS_ORG_ASSETS_BUCKET =
  process.env.APP_GCP_ORG_ASSETS_BUCKET ||
  process.env.APP_AWS_ORG_ASSETS_BUCKET;

const configuredBuckets = [
  BUCKET_NAME,
  APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET,
  APP_AWS_KNOWLEDGE_BASE_BUCKET,
  APP_AWS_ORG_ASSETS_BUCKET,
  process.env.FLEET_AGENT_BUCKET_NAME,
].filter(isNonEmptyString);

export function getStorageClientConfig(): S3ClientConfig {
  if (!STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY || !STORAGE_REGION) {
    throw new Error(
      'Object storage credentials or configuration missing. Set APP_GCP_* vars or APP_AWS_* fallback vars.',
    );
  }

  return {
    endpoint: STORAGE_ENDPOINT,
    region: STORAGE_REGION,
    credentials: {
      accessKeyId: STORAGE_ACCESS_KEY_ID,
      secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
    },
    forcePathStyle: Boolean(STORAGE_ENDPOINT),
  };
}

export function createStorageClient(): S3Client {
  return new S3Client(getStorageClientConfig());
}

let s3ClientInstance: S3Client | null = null;

try {
  if (
    !STORAGE_ACCESS_KEY_ID ||
    !STORAGE_SECRET_ACCESS_KEY ||
    !BUCKET_NAME ||
    !STORAGE_REGION
  ) {
    logger.error(
      '[S3] Object storage credentials or configuration missing. Check GCP or AWS fallback environment variables.',
    );
    throw new Error(
      'Object storage credentials or configuration missing. Check GCP or AWS fallback environment variables.',
    );
  }

  s3ClientInstance = createStorageClient();
} catch (error) {
  logger.error(
    'FAILED TO INITIALIZE S3 CLIENT',
    error instanceof Error ? error.stack : error,
  );
  s3ClientInstance = null;
  logger.error(
    '[S3] Creating dummy S3 client - file uploads will fail until credentials are fixed',
  );
}

export const s3Client = s3ClientInstance;

function isValidS3Host(host: string): boolean {
  const normalizedHost = host.toLowerCase();

  if (
    normalizedHost === 'storage.googleapis.com' ||
    normalizedHost === 'storage.cloud.google.com' ||
    normalizedHost.endsWith('.storage.googleapis.com')
  ) {
    return true;
  }

  if (!normalizedHost.endsWith('.amazonaws.com')) {
    return false;
  }

  return /^([\w.-]+\.)?(s3|s3-[\w-]+|s3-website[\w.-]+|s3-accesspoint|s3-control)(\.[\w-]+)?\.amazonaws\.com$/.test(
    normalizedHost,
  );
}

export function extractS3KeyFromUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid input: URL must be a non-empty string');
  }

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(url);
  } catch {
    // not a URL, continue
  }

  if (parsedUrl) {
    if (!isValidS3Host(parsedUrl.host)) {
      throw new Error('Invalid URL: Not a valid S3 endpoint');
    }

    let key = decodeURIComponent(parsedUrl.pathname.substring(1));

    for (const bucket of configuredBuckets) {
      if (key.startsWith(`${bucket}/`)) {
        key = key.slice(bucket.length + 1);
        break;
      }
    }

    if (key.includes('../') || key.includes('..\\')) {
      throw new Error('Invalid S3 key: Path traversal detected');
    }

    if (!key) {
      throw new Error('Invalid S3 key: Key cannot be empty');
    }

    return key;
  }

  // Reject inputs that look like URLs or domains but weren't parsed as valid S3 URLs above
  // This catches malformed URLs and prevents URL injection attacks
  const lowerInput = url.toLowerCase();
  if (
    lowerInput.includes('://') ||
    lowerInput.includes('amazonaws.com') ||
    lowerInput.includes('storage.googleapis.com')
  ) {
    throw new Error('Invalid input: Malformed URL detected');
  }

  // Check for domain-like patterns (e.g., "example.com", "sub.example.com")
  // S3 keys should not contain domain patterns
  const domainPattern =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(\/|$)/i;
  if (domainPattern.test(url)) {
    throw new Error('Invalid input: Domain-like pattern detected in S3 key');
  }

  if (url.includes('../') || url.includes('..\\')) {
    throw new Error('Invalid S3 key: Path traversal detected');
  }

  const key = url.startsWith('/') ? url.substring(1) : url;

  if (!key) {
    throw new Error('Invalid S3 key: Key cannot be empty');
  }

  return key;
}

export async function getFleetAgent({
  os,
}: {
  os: 'macos' | 'windows' | 'linux';
}): Promise<GetObjectCommandOutput['Body']> {
  if (!s3Client) {
    throw new Error('S3 client not configured');
  }

  const fleetBucketName = process.env.FLEET_AGENT_BUCKET_NAME;
  const fleetAgentFileName = 'Comp AI Agent-1.0.0-arm64.dmg';

  if (!fleetBucketName) {
    throw new Error('FLEET_AGENT_BUCKET_NAME is not defined.');
  }

  const getFleetAgentCommand = new GetObjectCommand({
    Bucket: fleetBucketName,
    Key: `${os}/${fleetAgentFileName}`,
  });

  const response = await s3Client.send(getFleetAgentCommand);
  return response.Body;
}
