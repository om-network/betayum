import { defineConfig } from '@trigger.dev/sdk';
import { caBundleExtension } from './caBundleExtension';
import { prismaExtension } from './customPrismaExtension';
import { emailExtension } from './emailExtension';
import { integrationPlatformExtension } from './integrationPlatformExtension';
import dotenv from 'dotenv';
dotenv.config();

const triggerProjectId = process.env.TRIGGER_PROJECT_ID;
if (!triggerProjectId) {
  throw new Error('TRIGGER_PROJECT_ID must be configured before deploying Trigger.dev tasks');
}

export default defineConfig({
  runtime: 'node-22',
  project: triggerProjectId,
  logLevel: 'log',
  maxDuration: 300, // 5 minutes
  build: {
    extensions: [
      caBundleExtension(),
      prismaExtension({
        version: '7.6.0',
        dbPackageVersion: '^2.0.0',
      }),
      integrationPlatformExtension(),
      emailExtension(),
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
  dirs: ['./src/trigger'],
});
