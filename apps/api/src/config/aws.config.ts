import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const awsConfigSchema = z.object({
  region: z.string().default('us-east-1'),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  bucketName: z.string().optional(),
  endpoint: z.string().optional(),
});

export type AwsConfig = z.infer<typeof awsConfigSchema>;

export const awsConfig = registerAs('aws', (): AwsConfig => {
  const config = {
    region: process.env.APP_AWS_REGION || 'us-east-1',
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY || undefined,
    bucketName: process.env.APP_AWS_BUCKET_NAME || undefined,
    endpoint: process.env.APP_AWS_ENDPOINT || undefined,
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
      '[AWS] S3 configuration is incomplete. AWS-backed uploads and storage operations will remain disabled.',
    );
  }

  return result.data;
});
