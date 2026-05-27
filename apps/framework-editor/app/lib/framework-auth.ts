import { auth as clerkAuth } from '@clerk/nextjs/server';
import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers';
import { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const ALLOWED_DOMAIN = 'trycomp.ai';

const FrameworkUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.string().nullable(),
});

const MeResponseSchema = z.object({
  user: FrameworkUserSchema.nullable(),
});

export type FrameworkUser = z.infer<typeof FrameworkUserSchema>;

function forwardAuthHeaders(headers: ReadonlyHeaders | Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'cookie' || lowerKey.startsWith('x-')) {
      result[key] = value;
    }
  });
  return result;
}

export async function getFrameworkEditorUser(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<FrameworkUser | null> {
  const { userId } = await clerkAuth();
  if (!userId) {
    return null;
  }

  const response = await fetch(`${API_URL}/v1/auth/me`, {
    method: 'GET',
    headers: {
      ...forwardAuthHeaders(options.headers),
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const parsed = MeResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.user : null;
}

export function canAccessFrameworkEditor(user: FrameworkUser | null): boolean {
  return Boolean(user && user.role === 'admin' && isInternalUser(user.email));
}

export function isInternalUser(email: string): boolean {
  const parts = email.split('@');
  return parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
}
