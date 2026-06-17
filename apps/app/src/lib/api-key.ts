import { db } from '@db/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { randomBytes, scryptSync, timingSafeEqual, webcrypto } from 'node:crypto';

const API_KEY_HASH_PREFIX = 'scrypt:v1';
const API_KEY_HASH_LENGTH = 32;
const API_KEY_SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;
const HEX_PATTERN = /^[a-f0-9]+$/i;

interface CandidateApiKeyRecord {
  id: string;
  key: string;
  salt: string | null;
  organizationId: string;
}

/**
 * Generate a new API key
 * @returns A new API key with prefix
 */
export function generateApiKey(): string {
  const apiKey = randomBytes(32).toString('hex');
  return `comp_${apiKey}`;
}

/** Extract the first 8 chars after the `comp_` prefix for indexed lookup */
export function extractKeyPrefix(apiKey: string): string {
  return apiKey.slice(5, 13);
}

/**
 * Generate a random salt for API key hashing
 * @returns A random salt string
 */
export function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Hash an API key for storage
 * @param apiKey The API key to hash
 * @param salt Salt to use for hashing.
 * @returns The hashed API key
 */
export function hashApiKey(apiKey: string, salt: string): string {
  const derivedKey = scryptSync(
    apiKey,
    Buffer.from(salt, 'hex'),
    API_KEY_HASH_LENGTH,
    API_KEY_SCRYPT_OPTIONS,
  );

  return `${API_KEY_HASH_PREFIX}:${derivedKey.toString('hex')}`;
}

async function legacyHashApiKey(apiKey: string, salt: string | null) {
  const input = new TextEncoder().encode(salt ? apiKey + salt : apiKey);
  const digest = await webcrypto.subtle.digest('SHA-256', input);
  return Buffer.from(digest).toString('hex');
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && HEX_PATTERN.test(value);
}

async function verifyApiKeyHash({
  apiKey,
  storedHash,
  salt,
}: {
  apiKey: string;
  storedHash: string;
  salt: string | null;
}): Promise<boolean> {
  if (storedHash.startsWith(`${API_KEY_HASH_PREFIX}:`)) {
    if (!salt || !isValidHex(salt)) {
      return false;
    }

    return timingSafeStringEqual(hashApiKey(apiKey, salt), storedHash);
  }

  const legacyHash = await legacyHashApiKey(apiKey, salt);
  return timingSafeStringEqual(legacyHash, storedHash);
}

async function findMatchingRecord(
  records: CandidateApiKeyRecord[],
  apiKey: string,
): Promise<CandidateApiKeyRecord | null> {
  for (const record of records) {
    if (
      await verifyApiKeyHash({
        apiKey,
        storedHash: record.key,
        salt: record.salt,
      })
    ) {
      return record;
    }
  }

  return null;
}

/**
 * Validate an API key from the request headers
 * @param req The Next.js request object
 * @returns The organization ID if the API key is valid, null otherwise
 */
export async function validateApiKey(req: NextRequest): Promise<string | null> {
  // Get the API key from the Authorization header
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Check if it's a Bearer token
  if (authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    return await validateApiKeyValue(apiKey);
  }

  // Check if it's an X-API-Key header
  const apiKey = req.headers.get('X-API-Key');
  if (apiKey) {
    return await validateApiKeyValue(apiKey);
  }

  return null;
}

/**
 * Validate an API key value
 * @param apiKey The API key to validate
 * @returns The organization ID if the API key is valid, null otherwise
 */
export async function validateApiKeyValue(apiKey: string): Promise<string | null> {
  if (!apiKey) {
    return null;
  }

  try {
    // Check if the model exists in the Prisma client
    if (typeof db.apiKey === 'undefined') {
      console.error('ApiKey model not found. Make sure to run migrations.');
      return null;
    }

    // Use key prefix for indexed lookup when available (new keys),
    // fall back to full scan for legacy keys without prefix
    const keyPrefix = apiKey.startsWith('comp_') ? extractKeyPrefix(apiKey) : null;

    const apiKeyRecords = await db.apiKey.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        ...(keyPrefix ? { keyPrefix } : {}),
      },
      select: {
        id: true,
        key: true,
        salt: true,
        organizationId: true,
        expiresAt: true,
      },
    });

    const matchingRecord = await findMatchingRecord(apiKeyRecords, apiKey);

    if (!matchingRecord) {
      // Try legacy keys (no prefix set) for backwards compatibility
      if (keyPrefix) {
        const legacyRecords = await db.apiKey.findMany({
          where: {
            isActive: true,
            keyPrefix: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: {
            id: true,
            key: true,
            salt: true,
            organizationId: true,
            expiresAt: true,
          },
        });
        const legacyMatch = await findMatchingRecord(legacyRecords, apiKey);
        if (legacyMatch) {
          // Backfill the prefix for future lookups
          await db.apiKey.update({
            where: { id: legacyMatch.id },
            data: { keyPrefix, lastUsedAt: new Date() },
          });
          return legacyMatch.organizationId;
        }
      }
      return null;
    }

    await db.apiKey.update({
      where: { id: matchingRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return matchingRecord.organizationId;
  } catch (error) {
    console.error('Error validating API key:', error);
    return null;
  }
}

/**
 * Middleware to validate API keys for API routes
 * @param req The Next.js request object
 * @returns A response if the API key is invalid, or the organization ID if valid
 */
export async function apiKeyMiddleware(req: NextRequest): Promise<NextResponse | string> {
  const organizationId = await validateApiKey(req);

  if (!organizationId) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  return organizationId;
}

/**
 * Get the organization ID from the API key in the request
 * This is a helper function that handles the result of apiKeyMiddleware
 * @param req The Next.js request object
 * @returns An object with the organization ID and/or error response
 */
export async function getOrganizationFromApiKey(req: NextRequest): Promise<{
  organizationId?: string;
  errorResponse?: NextResponse;
}> {
  const result = await apiKeyMiddleware(req);

  if (result instanceof NextResponse) {
    return { errorResponse: result };
  }

  return { organizationId: result };
}
