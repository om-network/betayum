import { puppeteer } from '@trigger.dev/build/extensions/puppeteer';
import { defineConfig } from '@trigger.dev/sdk';
import { prismaExtension } from './customPrismaExtension';

const triggerProjectId = process.env.TRIGGER_PROJECT_ID;
if (!triggerProjectId) {
  throw new Error('TRIGGER_PROJECT_ID must be configured before deploying Trigger.dev tasks');
}

export default defineConfig({
  runtime: 'node-22',
  project: triggerProjectId,
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
      puppeteer(),
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
