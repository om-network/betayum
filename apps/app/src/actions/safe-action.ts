import { env } from '@/env.mjs';
import { client } from '@trycompai/kv';
import { Ratelimit } from '@upstash/ratelimit';
import { DEFAULT_SERVER_ERROR_MESSAGE, createSafeActionClient } from 'next-safe-action';
import { headers } from 'next/headers';
import { z } from 'zod';
import {
  logActionResult,
  requireAuthenticatedActionSession,
  resolveActionOrganizationContext,
  trackAction,
  writeActionAuditLog,
  revalidateCurrentPath,
} from './safe-action-utils';
import { logger } from '@/utils/logger';

let ratelimit: Ratelimit | undefined;

if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimit = new Ratelimit({
    limiter: Ratelimit.fixedWindow(10, '10s'),
    redis: client,
  });
}

export const actionClientWithMeta = createSafeActionClient({
  handleServerError(e) {
    logger.error('Server error:', e);

    if (e instanceof Error) {
      throw e;
    }

    throw new Error(DEFAULT_SERVER_ERROR_MESSAGE);
  },
  throwValidationErrors: true,
  defineMetadataSchema() {
    return z.object({
      name: z.string(),
      ip: z.string().optional(),
      userAgent: z.string().optional(),
      track: z
        .object({
          description: z.string().optional(),
          event: z.string(),
          channel: z.string(),
        })
        .optional(),
    });
  },
});

export const authActionClient = actionClientWithMeta
  .use(async ({ next, clientInput }) => {
    const { session, user } = await requireAuthenticatedActionSession();
    const result = await next({
      ctx: {
        user,
        session,
      },
    });

    logActionResult({ clientInput, result });

    return result;
  })
  .use(async ({ next, metadata, ctx }) => {
    const rateLimitContext = await enforceRateLimit(metadata.name);

    return next({
      ctx: {
        ...ctx,
        ...rateLimitContext,
      },
    });
  })
  .use(async ({ next, clientInput, ctx }) => {
    const organization = await resolveActionOrganizationContext(clientInput);

    return next({
      ctx: {
        ...ctx,
        organizationId: organization.organizationId,
        memberId: organization.memberId,
        permissions: organization.permissions,
      },
    });
  })
  .use(async ({ next, metadata, ctx }) => {
    if (!ctx.user) {
      throw new Error('Unauthorized');
    }

    trackAction({
      metadata,
      organizationId: ctx.organizationId,
      user: ctx.user,
    });

    return next({ ctx });
  })
  .use(async ({ next, metadata, clientInput, ctx }) => {
    if (!ctx.user || !ctx.organizationId || !ctx.memberId || !ctx.permissions) {
      throw new Error('Unauthorized');
    }

    await writeActionAuditLog({
      clientInput,
      metadata,
      organization: {
        organizationId: ctx.organizationId,
        memberId: ctx.memberId,
        permissions: ctx.permissions,
      },
      user: ctx.user,
    });

    await revalidateCurrentPath();

    return next({ ctx });
  });

export const authWithOrgAccessClient = authActionClient.use(
  async ({ next, clientInput, ctx }) => {
    const organization = await resolveActionOrganizationContext(clientInput);

    if (organization.organizationId !== ctx.organizationId) {
      throw new Error('You do not have access to this organization');
    }

    return next({
      ctx: {
        ...ctx,
        organizationId: organization.organizationId,
        memberId: organization.memberId,
        permissions: organization.permissions,
      },
    });
  },
);

export const authActionClientWithoutOrg = actionClientWithMeta
  .use(async ({ next, clientInput }) => {
    const { session, user } = await requireAuthenticatedActionSession();
    const result = await next({
      ctx: {
        user,
        session,
      },
    });

    logActionResult({ clientInput, result });

    return result;
  })
  .use(async ({ next, metadata, ctx }) => {
    const rateLimitContext = await enforceRateLimit(metadata.name);

    return next({
      ctx: {
        ...ctx,
        ...rateLimitContext,
      },
    });
  })
  .use(async ({ next, metadata, ctx }) => {
    if (!ctx.user) {
      throw new Error('Unauthorized');
    }

    trackAction({
      metadata,
      user: ctx.user,
    });

    return next({ ctx });
  });

async function enforceRateLimit(actionName: string) {
  const headersList = await headers();
  let remaining: number | undefined;

  if (ratelimit && shouldRateLimit(actionName)) {
    const result = await ratelimit.limit(
      `${headersList.get('x-forwarded-for')}-${actionName}`,
    );

    if (!result.success) {
      throw new Error('Too many requests');
    }

    remaining = result.remaining;
  }

  return {
    ip: headersList.get('x-forwarded-for'),
    userAgent: headersList.get('user-agent'),
    ratelimit: {
      remaining: remaining ?? 0,
    },
  };
}

function shouldRateLimit(actionName: string): boolean {
  return ![
    'save-questionnaire-answer',
    'update-questionnaire-answer',
    'save-manual-answer',
    'save-questionnaire-answers-batch',
  ].includes(actionName);
}
