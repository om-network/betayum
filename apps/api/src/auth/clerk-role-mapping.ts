import { BadRequestException } from '@nestjs/common';
import { ROLE_HIERARCHY } from '@trycompai/auth';

export function resolveClerkRoleKey(roles: string[]): string {
  const role = [...roles].sort(compareRolesByAuthority).at(-1);
  if (!role) {
    throw new BadRequestException('At least one role is required.');
  }

  if (role === 'owner') return 'org:admin';
  if (role.startsWith('org:')) return role;
  return `org:${role}`;
}

export function normalizeClerkRoleKey(role: string | null | undefined): string {
  if (!role) return 'org:member';
  return role.startsWith('org:') ? role : `org:${role}`;
}

function compareRolesByAuthority(a: string, b: string): number {
  return roleRank(a) - roleRank(b);
}

function roleRank(role: string): number {
  const normalized = role.replace(/^org:/, '');
  const rankedRoles: readonly string[] = ROLE_HIERARCHY;
  const index = rankedRoles.indexOf(normalized);

  return index === -1 ? ROLE_HIERARCHY.length : index;
}
