import { SupportedOS } from '@/app/api/download-agent/types';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as _getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const getSignedUrl = _getSignedUrl as unknown as (
  client: S3Client,
  command: GetObjectCommand | PutObjectCommand,
  options?: { expiresIn?: number },
) => Promise<string>;

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

const isGcpConfigured = Boolean(
  firstDefined(
    process.env.APP_GCP_ACCESS_KEY_ID,
    process.env.APP_GCP_BUCKET_NAME,
    process.env.APP_GCP_ENDPOINT,
    process.env.APP_GCP_ORG_ASSETS_BUCKET,
  ),
);
const storageProviderLabel = isGcpConfigured ? 'Google Cloud Storage' : 'AWS S3';
const storageRegion =
  firstDefined(process.env.APP_GCP_REGION, process.env.APP_AWS_REGION) ||
  (isGcpConfigured ? 'auto' : 'us-east-1');
const storageAccessKeyId = firstDefined(
  process.env.APP_GCP_ACCESS_KEY_ID,
  process.env.APP_AWS_ACCESS_KEY_ID,
);
const storageSecretAccessKey = firstDefined(
  process.env.APP_GCP_SECRET_ACCESS_KEY,
  process.env.APP_AWS_SECRET_ACCESS_KEY,
);
const storageEndpoint =
  firstDefined(process.env.APP_GCP_ENDPOINT, process.env.APP_AWS_ENDPOINT) ||
  (isGcpConfigured ? 'https://storage.googleapis.com' : undefined);

export const BUCKET_NAME = firstDefined(
  process.env.APP_GCP_BUCKET_NAME,
  process.env.APP_AWS_BUCKET_NAME,
);
export const APP_AWS_ORG_ASSETS_BUCKET = firstDefined(
  process.env.APP_GCP_ORG_ASSETS_BUCKET,
  process.env.APP_AWS_ORG_ASSETS_BUCKET,
  BUCKET_NAME,
);

const knownBucketNames = [
  BUCKET_NAME,
  APP_AWS_ORG_ASSETS_BUCKET,
  normalizeEnvValue(process.env.FLEET_AGENT_BUCKET_NAME),
].filter((value): value is string => Boolean(value));

export function createStorageClient(): S3Client {
  if (!storageAccessKeyId || !storageSecretAccessKey) {
    throw new Error(
      `[Storage] ${storageProviderLabel} credentials are missing. Set APP_GCP_* variables (preferred) or APP_AWS_* legacy variables.`,
    );
  }

  return new S3Client({
    endpoint: storageEndpoint,
    region: storageRegion,
    credentials: {
      accessKeyId: storageAccessKeyId,
      secretAccessKey: storageSecretAccessKey,
    },
    forcePathStyle: !!storageEndpoint,
  });
}

let s3ClientInstance: S3Client | null = null;

try {
  if (!storageAccessKeyId || !storageSecretAccessKey) {
    throw new Error(`[Storage] ${storageProviderLabel} credentials or configuration missing.`);
  }

  s3ClientInstance = createStorageClient();
} catch (error) {
  console.warn('[Storage] File upload features are unavailable.', error);
  s3ClientInstance = null;
}

export const s3Client = s3ClientInstance;

function isValidAwsS3Host(host: string): boolean {
  const normalizedHost = host.toLowerCase();

  if (!normalizedHost.endsWith('.amazonaws.com')) {
    return false;
  }

  return /^([\w.-]+\.)?(s3|s3-[\w-]+|s3-website[\w.-]+|s3-accesspoint|s3-control)(\.[\w-]+)?\.amazonaws\.com$/.test(
    normalizedHost,
  );
}

function isValidGcsHost(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  return (
    normalizedHost === 'storage.googleapis.com' ||
    normalizedHost.endsWith('.storage.googleapis.com')
  );
}

function hasDomainLikePrefix(value: string): boolean {
  const domainPattern =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(\/|$)/i;
  return domainPattern.test(value);
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
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Invalid URL: Object storage endpoint must use HTTPS');
    }

    const isAwsHost = isValidAwsS3Host(parsedUrl.hostname);
    const isGcsHost = isValidGcsHost(parsedUrl.hostname);

    if (!isAwsHost && !isGcsHost) {
      throw new Error('Invalid URL: Not a valid object storage endpoint');
    }

    const pathname = decodeURIComponent(parsedUrl.pathname.substring(1));
    const pathSegments = pathname.split('/').filter(Boolean);

    let key = pathname;
    if (
      isGcsHost &&
      parsedUrl.hostname.toLowerCase() === 'storage.googleapis.com' &&
      pathSegments.length > 1 &&
      knownBucketNames.includes(pathSegments[0]!)
    ) {
      key = pathSegments.slice(1).join('/');
    }

    if (key.includes('../') || key.includes('..\\')) {
      throw new Error('Invalid S3 key: Path traversal detected');
    }

    if (!key) {
      throw new Error('Invalid S3 key: Key cannot be empty');
    }

    return key;
  }

  const lowerInput = url.toLowerCase();
  if (lowerInput.includes('://')) {
    throw new Error('Invalid input: Malformed URL detected');
  }

  if (hasDomainLikePrefix(url)) {
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

export async function getFleetAgent({ os }: { os: SupportedOS }) {
  if (!s3Client) {
    throw new Error('Object storage client not configured');
  }

  const fleetBucketName = normalizeEnvValue(process.env.FLEET_AGENT_BUCKET_NAME) ?? BUCKET_NAME;

  if (!fleetBucketName) {
    throw new Error('FLEET_AGENT_BUCKET_NAME is not defined.');
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

export async function getPresignedDownloadUrl({
  bucketName,
  key,
  expiresIn = 3600,
}: {
  bucketName: string;
  key: string;
  expiresIn?: number;
}): Promise<string> {
  if (!s3Client) {
    throw new Error('Object storage client not configured');
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedUploadUrl({
  bucketName,
  key,
  contentType,
  expiresIn = 3600,
}: {
  bucketName: string;
  key: string;
  contentType?: string;
  expiresIn?: number;
}): Promise<string> {
  if (!s3Client) {
    throw new Error('Object storage client not configured');
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}
