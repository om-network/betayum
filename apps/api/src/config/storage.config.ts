import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const storageConfigSchema = z.object({
  provider: z.enum(['gcp', 'aws']),
  region: z.string().min(1, 'Storage region is required'),
  accessKeyId: z.string().min(1, 'Storage access key is required'),
  secretAccessKey: z.string().min(1, 'Storage secret key is required'),
  bucketName: z.string().min(1, 'Storage bucket name is required'),
  endpoint: z.string().optional(),
});

export type StorageConfig = z.infer<typeof storageConfigSchema>;

export const storageConfig = registerAs('storage', (): StorageConfig => {
  const hasGcpStorageEnv = [
    process.env.APP_GCP_ACCESS_KEY_ID,
    process.env.APP_GCP_SECRET_ACCESS_KEY,
    process.env.APP_GCP_BUCKET_NAME,
    process.env.APP_GCP_ENDPOINT,
  ].some((value) => typeof value === 'string' && value.length > 0);

  const provider = hasGcpStorageEnv ? 'gcp' : 'aws';

  const config = {
    provider,
    region:
      process.env.APP_GCP_REGION ||
      process.env.APP_AWS_REGION ||
      (provider === 'gcp' ? 'auto' : 'us-east-1'),
    accessKeyId:
      process.env.APP_GCP_ACCESS_KEY_ID ||
      process.env.APP_AWS_ACCESS_KEY_ID ||
      '',
    secretAccessKey:
      process.env.APP_GCP_SECRET_ACCESS_KEY ||
      process.env.APP_AWS_SECRET_ACCESS_KEY ||
      '',
    bucketName:
      process.env.APP_GCP_BUCKET_NAME || process.env.APP_AWS_BUCKET_NAME || '',
    endpoint:
      process.env.APP_GCP_ENDPOINT ||
      process.env.APP_AWS_ENDPOINT ||
      (provider === 'gcp' ? 'https://storage.googleapis.com' : undefined),
  };

  const result = storageConfigSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Storage configuration validation failed: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')}`,
    );
  }

  return result.data;
});
