import { registerAs } from '@nestjs/config';
import { z } from 'zod';

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

const awsConfigSchema = z.object({
  region: z.string().default('auto'),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  bucketName: z.string().optional(),
  endpoint: z.string().optional(),
});

export type AwsConfig = z.infer<typeof awsConfigSchema>;

export const awsConfig = registerAs('aws', (): AwsConfig => {
  const isGcpConfigured = Boolean(
    firstDefined(
      process.env.APP_GCP_ACCESS_KEY_ID,
      process.env.APP_GCP_BUCKET_NAME,
      process.env.APP_GCP_ENDPOINT,
    ),
  );

  const config = {
    region:
      firstDefined(process.env.APP_GCP_REGION, process.env.APP_AWS_REGION) ||
      (isGcpConfigured ? 'auto' : 'us-east-1'),
    accessKeyId: firstDefined(
      process.env.APP_GCP_ACCESS_KEY_ID,
      process.env.APP_AWS_ACCESS_KEY_ID,
    ),
    secretAccessKey: firstDefined(
      process.env.APP_GCP_SECRET_ACCESS_KEY,
      process.env.APP_AWS_SECRET_ACCESS_KEY,
    ),
    bucketName: firstDefined(
      process.env.APP_GCP_BUCKET_NAME,
      process.env.APP_AWS_BUCKET_NAME,
    ),
    endpoint:
      firstDefined(process.env.APP_GCP_ENDPOINT, process.env.APP_AWS_ENDPOINT) ||
      (isGcpConfigured ? 'https://storage.googleapis.com' : undefined),
  };

  // Validate configuration at startup
  const result = awsConfigSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `AWS configuration validation failed: ${result.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`,
    );
  }

  if (
    !result.data.accessKeyId ||
    !result.data.secretAccessKey ||
    !result.data.bucketName
  ) {
    console.warn(
      '[Storage] Object storage configuration is incomplete. Set APP_GCP_* variables (preferred) or APP_AWS_* legacy variables to enable uploads.',
    );
  }

  return result.data;
});
