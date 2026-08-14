const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const envFiles = [
  resolve(__dirname, '.env.local'),
  resolve(__dirname, '.env'),
  resolve(__dirname, '../../.env.local'),
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../apps/portal/.env.local'),
  resolve(__dirname, '../../apps/portal/.env'),
  resolve(__dirname, '../../apps/app/.env.local'),
  resolve(__dirname, '../../apps/app/.env'),
  resolve(__dirname, '../../apps/api/.env.local'),
  resolve(__dirname, '../../apps/api/.env'),
];

/**
 * Minimal .env file parser — covers the common KEY=VALUE, KEY="VALUE", and
 * KEY='VALUE' forms used by the project. Keeps dotenv out of this package's
 * dependencies so the build works in CI without a full monorepo install.
 */
function parseEnvContent(content) {
  const result = {};
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function loadEnvFromFiles() {
  const loaded = {};

  for (const envFile of envFiles) {
    if (!existsSync(envFile)) {
      continue;
    }

    const parsed = parseEnvContent(readFileSync(envFile, 'utf8'));
    Object.assign(loaded, parsed);
  }

  return loaded;
}

const fileEnv = loadEnvFromFiles();

function firstDefined(...values) {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length > 0) {
      return trimmedValue;
    }
  }

  return undefined;
}

function resolveBuildEnv() {
  const portalUrl = firstDefined(
    process.env.PORTAL_URL,
    process.env.NEXT_PUBLIC_PORTAL_URL,
    process.env.BETTER_AUTH_URL,
    fileEnv.PORTAL_URL,
    fileEnv.NEXT_PUBLIC_PORTAL_URL,
    fileEnv.BETTER_AUTH_URL,
    'https://portal.betayum.com',
  );

  const apiUrl = firstDefined(
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.BACKEND_API_URL,
    process.env.BASE_URL,
    fileEnv.API_URL,
    fileEnv.NEXT_PUBLIC_API_URL,
    fileEnv.BACKEND_API_URL,
    fileEnv.BASE_URL,
    'https://api.betayum.com',
  );

  const autoUpdateUrl = firstDefined(
    process.env.AUTO_UPDATE_URL,
    fileEnv.AUTO_UPDATE_URL,
    `${portalUrl}/api/device-agent/updates`,
  );

  const agentVersion = firstDefined(process.env.AGENT_VERSION, fileEnv.AGENT_VERSION);

  return {
    portalUrl,
    apiUrl,
    autoUpdateUrl,
    agentVersion,
  };
}

module.exports = {
  resolveBuildEnv,
};
