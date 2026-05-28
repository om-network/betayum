import { SupportedOS } from '@/app/api/download-agent/types';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl as _getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Re-export getSignedUrl with a type workaround for bun's duplicate @smithy/types.
 * Bun on Vercel installs separate @smithy/types copies for @aws-sdk/client-s3
 * and @aws-sdk/s3-request-presigner even when pinned to the same version.
 * The runtime types are fully compatible — only the TypeScript class identity differs.
 */
export const getSignedUrl = _getSignedUrl as unknown as (
  client: S3Client,
  command: GetObjectCommand | PutObjectCommand,
  options?: { expiresIn?: number },
) => Promise<string>;

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
export const APP_AWS_ORG_ASSETS_BUCKET =
  process.env.APP_GCP_ORG_ASSETS_BUCKET ||
  process.env.APP_AWS_ORG_ASSETS_BUCKET;

const configuredBuckets = [
  BUCKET_NAME,
  APP_AWS_ORG_ASSETS_BUCKET,
  process.env.FLEET_AGENT_BUCKET_NAME,
].filter(isNonEmptyString);

if (
  !STORAGE_ACCESS_KEY_ID ||
  !STORAGE_SECRET_ACCESS_KEY ||
  !BUCKET_NAME ||
  !STORAGE_REGION
) {
  console.warn(
    'Object storage credentials or configuration missing in environment variables. File upload features will be unavailable.',
  );
}

function getStorageClientConfig(): S3ClientConfig {
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

let s3ClientInstance: S3Client | null = null;

try {
  if (
    !STORAGE_ACCESS_KEY_ID ||
    !STORAGE_SECRET_ACCESS_KEY ||
    !BUCKET_NAME ||
    !STORAGE_REGION
  ) {
    throw new Error(
      'Object storage credentials or configuration missing. Set APP_GCP_* vars or APP_AWS_* fallback vars.',
    );
  }

  s3ClientInstance = new S3Client(getStorageClientConfig());
} catch (error) {
  console.error('FAILED TO INITIALIZE PORTAL OBJECT STORAGE CLIENT', error);
  s3ClientInstance = null;
}

export const s3Client = s3ClientInstance;

// Ensure BUCKET_NAME is exported and non-null checked if needed elsewhere explicitly
if (!BUCKET_NAME && process.env.NODE_ENV === 'production') {
  console.error('AWS_BUCKET_NAME is not defined.');
}

/**
 * Validates if a hostname is a valid AWS S3 endpoint
 */
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

/**
 * Extracts S3 object key from either a full S3 URL or a plain key
 * @throws {Error} If the input is invalid or potentially malicious
 */
export function extractS3KeyFromUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid input: URL must be a non-empty string');
  }

  // Try to parse as URL
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(url);
  } catch {
    // Not a valid URL - will handle as S3 key below
  }

  if (parsedUrl) {
    // Validate it's an S3 URL
    if (!isValidS3Host(parsedUrl.host)) {
      throw new Error('Invalid URL: Not a valid S3 endpoint');
    }

    // Extract and validate the key
    let key = decodeURIComponent(parsedUrl.pathname.substring(1));

    for (const bucket of configuredBuckets) {
      if (key.startsWith(`${bucket}/`)) {
        key = key.slice(bucket.length + 1);
        break;
      }
    }

    // Security: Check for path traversal
    if (key.includes('../') || key.includes('..\\')) {
      throw new Error('Invalid S3 key: Path traversal detected');
    }

    // Validate key is not empty
    if (!key) {
      throw new Error('Invalid S3 key: Key cannot be empty');
    }

    return key;
  }

  // Not a URL - treat as S3 key
  // Security: Ensure it's not a malformed URL attempting to bypass validation
  const lowerInput = url.toLowerCase();
  if (
    lowerInput.includes('://') ||
    lowerInput.includes('amazonaws.com') ||
    lowerInput.includes('storage.googleapis.com')
  ) {
    throw new Error('Invalid input: Malformed URL detected');
  }

  // Security: Check for path traversal
  if (url.includes('../') || url.includes('..\\')) {
    throw new Error('Invalid S3 key: Path traversal detected');
  }

  // Remove leading slash if present
  const key = url.startsWith('/') ? url.substring(1) : url;

  // Validate key is not empty
  if (!key) {
    throw new Error('Invalid S3 key: Key cannot be empty');
  }

  return key;
}

export async function getFleetAgent({ os }: { os: SupportedOS }) {
  if (!s3Client) {
    throw new Error('Object storage client is not configured.');
  }

  const fleetBucketName = process.env.FLEET_AGENT_BUCKET_NAME;

  if (!fleetBucketName) {
    throw new Error('FLEET_AGENT_BUCKET_NAME is not defined.');
  }

  let extension: string;
  switch (os) {
    case 'macos':
      extension = 'pkg';
      break;
    case 'windows':
      extension = 'msi';
      break;
    default:
      throw new Error(`Unsupported OS: ${os}`);
  }

  const macosPackageFilename = 'Comp AI Agent-1.0.0-arm64.dmg';
  const windowsPackageFilename = 'fleet-osquery.msi';

  const getFleetAgentCommand = new GetObjectCommand({
    Bucket: fleetBucketName,
    Key: `${os}/${os === 'macos' ? macosPackageFilename : windowsPackageFilename}`,
  });

  const response = await s3Client.send(getFleetAgentCommand);
  return response.Body;
}

/**
 * Generates a presigned URL for downloading a file from S3
 */
export async function getPresignedDownloadUrl({
  bucketName,
  key,
  expiresIn = 3600, // 1 hour default
}: {
  bucketName: string;
  key: string;
  expiresIn?: number;
}): Promise<string> {
  if (!s3Client) {
    throw new Error('Object storage client is not configured.');
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generates a presigned URL for uploading a file to S3
 */
export async function getPresignedUploadUrl({
  bucketName,
  key,
  contentType,
  expiresIn = 3600, // 1 hour default
}: {
  bucketName: string;
  key: string;
  contentType?: string;
  expiresIn?: number;
}): Promise<string> {
  if (!s3Client) {
    throw new Error('Object storage client is not configured.');
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}
