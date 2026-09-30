import { syncEnvVars } from '@trigger.dev/build/extensions/core';
import { puppeteer } from '@trigger.dev/build/extensions/puppeteer';
import { defineConfig } from '@trigger.dev/sdk';
import { emailExtension } from '../api/emailExtension';
import { integrationPlatformExtension } from '../api/integrationPlatformExtension';
import { prismaExtension } from './customPrismaExtension';

const publicTaskEnvironmentVariables = [
  'API_BASE_URL',
  'APP_GCP_BUCKET_NAME',
  'APP_GCP_ENDPOINT',
  'APP_GCP_KNOWLEDGE_BASE_BUCKET',
  'APP_GCP_ORG_ASSETS_BUCKET',
  'APP_GCP_QUESTIONNAIRE_UPLOAD_BUCKET',
  'APP_GCP_REGION',
  'BACKEND_API_URL',
  'BASE_URL',
  'BETTER_AUTH_URL',
  'CODEX_AUTOMATION_API_BASE_URL',
  'CODEX_AUTOMATION_LOCAL_DIRECT',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BETTER_AUTH_URL',
  'NEXT_PUBLIC_PORTAL_URL',
];

const secretTaskEnvironmentVariables = [
  'ANTHROPIC_API_KEY',
  'APP_GCP_ACCESS_KEY_ID',
  'APP_GCP_SECRET_ACCESS_KEY',
  'AUTH_SECRET',
  'DATABASE_URL',
  'ENCRYPTION_KEY',
  'FIRECRAWL_API_KEY',
  'GROQ_API_KEY',
  'NOVU_API_KEY',
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'REVALIDATION_SECRET',
  'SECRET_KEY',
  'SERVICE_TOKEN_TRIGGER',
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
];

const triggerProjectId =
  process.env.TRIGGER_PROJECT_REF ??
  process.env.TRIGGER_PROJECT_ID ??
  'proj_gwvzyfdlnhltmyqcqzcn';

export default defineConfig({
  project: triggerProjectId,
  runtime: 'node-22',
  logLevel: 'log',
  // PrismaInstrumentation was emitting a `prisma:client:operation` span for
  // every query, drowning out our own task logs. We rely on per-task
  // `logger.info` calls for observability instead — see e.g.
  // `link-risks-and-vendors-to-work.ts`.
  instrumentations: [],
  maxDuration: 300, // 5 minutes
  build: {
    extensions: [
      prismaExtension({
        version: '7.6.0',
        dbPackageVersion: '^2.0.0',
      }),
      integrationPlatformExtension(),
      emailExtension(),
      puppeteer(),
      syncEnvVars(() => [
        ...publicTaskEnvironmentVariables.flatMap((name) => {
          const value = process.env[name];
          return value ? [{ name, value }] : [];
        }),
        ...secretTaskEnvironmentVariables.flatMap((name) => {
          const value = process.env[name];
          return value ? [{ name, value, isSecret: true }] : [];
        }),
      ]),
    ],
  },
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  // Trigger.dev permits one active development worker version per project and
  // branch. The API and app use the same project, so the browser delegation
  // tasks must be registered alongside the app queue tasks instead of running
  // a second CLI that supersedes this worker.
  dirs: ['./src/jobs', './src/trigger', '../api/src/trigger/tasks'],
});
