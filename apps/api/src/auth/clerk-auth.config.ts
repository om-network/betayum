const DEFAULT_CLERK_JWKS_URL = 'https://api.clerk.com/v1/jwks';

export type ClerkAuthConfig = {
  secretKey: string;
  issuer: string;
  authorizedParties: string[];
  jwksUrl: string;
};

export function isClerkAuthProvider(): boolean {
  return process.env.AUTH_PROVIDER === 'clerk';
}

export function getClerkAuthConfig(): ClerkAuthConfig {
  const secretKey = getRequiredEnv('CLERK_SECRET_KEY');
  const issuer = getRequiredEnv('CLERK_JWT_ISSUER');
  const authorizedParties = parseAuthorizedParties(
    getRequiredEnv('CLERK_AUTHORIZED_PARTIES'),
  );
  const jwksUrl = process.env.CLERK_JWKS_URL ?? DEFAULT_CLERK_JWKS_URL;

  assertValidUrl({ name: 'CLERK_JWKS_URL', value: jwksUrl });

  return {
    secretKey,
    issuer,
    authorizedParties,
    jwksUrl,
  };
}

export function validateClerkAuthConfig(): void {
  if (!isClerkAuthProvider()) {
    return;
  }

  getClerkAuthConfig();
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when AUTH_PROVIDER=clerk.`);
  }

  return value;
}

function parseAuthorizedParties(value: string): string[] {
  const parties = value
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);

  if (!parties.length) {
    throw new Error(
      'CLERK_AUTHORIZED_PARTIES must include at least one origin when AUTH_PROVIDER=clerk.',
    );
  }

  return parties;
}

function assertValidUrl({ name, value }: { name: string; value: string }): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL when AUTH_PROVIDER=clerk.`);
  }
}
