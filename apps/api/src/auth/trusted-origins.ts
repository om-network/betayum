import { db } from '@db';
import { Redis } from '@upstash/redis';

const CORS_DOMAINS_CACHE_KEY = 'cors:custom-domains';
const CORS_DOMAINS_CACHE_TTL_SECONDS = 5 * 60;

const corsRedisClient =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export function getTrustedOrigins(): string[] {
  const origins = process.env.AUTH_TRUSTED_ORIGINS;
  if (origins) {
    return origins.split(',').map((origin) => origin.trim());
  }

  return [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3333',
    'http://localhost:3004',
    'http://localhost:3008',
    'https://app.trycomp.ai',
    'https://portal.trycomp.ai',
    'https://api.trycomp.ai',
    'https://app.staging.trycomp.ai',
    'https://portal.staging.trycomp.ai',
    'https://api.staging.trycomp.ai',
    'https://dev.trycomp.ai',
    'https://framework-editor.trycomp.ai',
  ];
}

export function isStaticTrustedOrigin(origin: string): boolean {
  const trustedOrigins = getTrustedOrigins();
  if (trustedOrigins.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    return (
      url.hostname.endsWith('.trycomp.ai') ||
      url.hostname.endsWith('.staging.trycomp.ai') ||
      url.hostname.endsWith('.trust.inc') ||
      url.hostname === 'trust.inc'
    );
  } catch {
    return false;
  }
}

async function getCustomDomains(): Promise<Set<string>> {
  if (corsRedisClient) {
    try {
      const cached = await corsRedisClient.get<string[]>(CORS_DOMAINS_CACHE_KEY);
      if (cached) {
        return new Set(cached);
      }
    } catch (error) {
      console.error('[CORS] Redis cache read failed, falling back to DB:', error);
    }
  }

  try {
    const trusts = await db.trust.findMany({
      where: {
        domain: { not: null },
        domainVerified: true,
        status: 'published',
      },
      select: { domain: true },
    });

    const domains = trusts
      .map((trust) => trust.domain)
      .filter((domain): domain is string => domain !== null);

    if (corsRedisClient) {
      try {
        await corsRedisClient.set(CORS_DOMAINS_CACHE_KEY, domains, {
          ex: CORS_DOMAINS_CACHE_TTL_SECONDS,
        });
      } catch {
        // Ignore cache write failures.
      }
    }

    return new Set(domains);
  } catch (error) {
    console.error('[CORS] Failed to fetch custom domains from DB:', error);
    return new Set();
  }
}

export async function isTrustedOrigin(origin: string): Promise<boolean> {
  if (isStaticTrustedOrigin(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const customDomains = await getCustomDomains();
    return customDomains.has(url.hostname);
  } catch {
    return false;
  }
}
