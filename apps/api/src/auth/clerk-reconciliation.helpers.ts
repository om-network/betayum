import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { parseCompAiPermission, parseRolePermissions } from '@trycompai/auth';
import {
  normalizeClerkRoleKey,
  resolveClerkRoleKey,
} from './clerk-role-mapping';

export function isOrganizationEvent(type: string): boolean {
  return type === 'organization.created' || type === 'organization.updated';
}

export function isMembershipUpsertEvent(type: string): boolean {
  return (
    type === 'organizationMembership.created' ||
    type === 'organizationMembership.updated' ||
    type === 'organization_membership.created' ||
    type === 'organization_membership.updated'
  );
}

export function isMembershipDeletedEvent(type: string): boolean {
  return (
    type === 'organizationMembership.deleted' ||
    type === 'organization_membership.deleted'
  );
}

export function firstHeader(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function verifyClerkWebhookPayload(params: {
  rawBody: Buffer | undefined;
  headers: Record<string, string | string[] | undefined>;
}): unknown {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    throw new BadRequestException('CLERK_WEBHOOK_SECRET is not configured.');
  }
  if (!params.rawBody) {
    throw new BadRequestException('Missing raw body for Clerk webhook.');
  }

  const id = firstHeader(params.headers['svix-id']);
  const timestamp = firstHeader(params.headers['svix-timestamp']);
  const signature = firstHeader(params.headers['svix-signature']);
  if (!id || !timestamp || !signature) {
    throw new UnauthorizedException('Missing Clerk webhook signature.');
  }

  const signedPayload = `${id}.${timestamp}.${params.rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', decodeSvixSecret(secret))
    .update(signedPayload)
    .digest('base64');

  if (!hasMatchingSignature({ signature, expected })) {
    throw new UnauthorizedException('Invalid Clerk webhook signature.');
  }

  try {
    return JSON.parse(params.rawBody.toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid Clerk webhook JSON.');
  }
}

export function decodeSvixSecret(secret: string): Buffer {
  return Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
}

export function hasMatchingSignature({
  signature,
  expected,
}: {
  signature: string;
  expected: string;
}): boolean {
  return signature.split(' ').some((candidate) => {
    const value = candidate.replace(/^v\d+,/, '');
    const expectedBuffer = Buffer.from(expected);
    const valueBuffer = Buffer.from(value);
    return (
      expectedBuffer.length === valueBuffer.length &&
      timingSafeEqual(expectedBuffer, valueBuffer)
    );
  });
}

export function toLocalRole(role: string | null | undefined): string {
  return normalizeClerkRoleKey(role).replace(/^org:/, '');
}

export function toClerkRoleKey(role: string): string {
  return resolveClerkRoleKey(splitRoles(role));
}

export function collectUnmappedPermissions(
  roles: Array<{ name: string; permissions: string }>,
): string[] {
  const unmapped: string[] = [];
  for (const role of roles) {
    const permissions = parseRolePermissions(role.permissions);
    if (!permissions) {
      unmapped.push(`${role.name}:invalid-json`);
      continue;
    }

    for (const [resource, actions] of Object.entries(permissions)) {
      for (const action of actions) {
        if (!parseCompAiPermission({ resource, action })) {
          unmapped.push(`${role.name}:${resource}:${action}`);
        }
      }
    }
  }

  return unmapped;
}

function splitRoles(role: string): string[] {
  return role
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
