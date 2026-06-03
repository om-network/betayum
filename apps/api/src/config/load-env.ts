import { config } from 'dotenv';
import { existsSync } from 'fs';
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
  // Load the repo root first so shared local secrets are available to the API.
  for (const rootEnvPath of rootEnvPaths) {
    if (!existsSync(rootEnvPath)) {
      continue;
    }

    config({ path: rootEnvPath, override: false });
    break;
  }

  // Then layer app-specific values on top.
  for (const envPath of appEnvPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    config({ path: envPath, override: true });
    break;
  }

  envLoaded = true;
}

if (!envLoaded) {
  loadEnv();
}

export function ensureEnvLoaded(): void {
  if (!envLoaded) {
    loadEnv();
  }
}
