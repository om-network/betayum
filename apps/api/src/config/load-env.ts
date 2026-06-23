import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

let envLoaded = false;

const rootEnvPaths = [
  path.join(process.cwd(), '..', '..', '.env'),
  path.join(__dirname, '..', '..', '..', '..', '.env'),
  path.join(__dirname, '..', '..', '..', '..', '..', '.env'),
];
const appEnvPaths = [
  // When compiled to dist/src (Nest build output)
  path.join(__dirname, '..', '..', '.env'),
  // When running with ts-node directly from src
  path.join(__dirname, '..', '.env'),
  // Fallback when Nest is launched from apps/api as cwd
  path.join(process.cwd(), '.env'),
];

function loadEnv(): void {
  const runtimeEnvKeys = new Set(Object.keys(process.env));

  // Load the repo root first so shared local secrets are available to the API.
  for (const rootEnvPath of rootEnvPaths) {
    if (!existsSync(rootEnvPath)) {
      continue;
    }

    mergeEnvFile({
      envPath: rootEnvPath,
      shouldOverride: () => false,
    });
    break;
  }

  // Then layer app-specific values on top.
  for (const envPath of appEnvPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    mergeEnvFile({
      envPath,
      shouldOverride: (key) => !runtimeEnvKeys.has(key),
    });
    break;
  }

  envLoaded = true;
}

function mergeEnvFile({
  envPath,
  shouldOverride,
}: {
  envPath: string;
  shouldOverride: (key: string) => boolean;
}): void {
  const parsed = parse(readFileSync(envPath));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || shouldOverride(key)) {
      process.env[key] = value;
    }
  }
}

if (!envLoaded) {
  loadEnv();
}

export function ensureEnvLoaded(): void {
  if (!envLoaded) {
    loadEnv();
  }
}
