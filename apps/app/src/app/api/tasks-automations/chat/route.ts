import { requireApiPermission } from '@/lib/permissions.server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const maxDuration = 300;

const chatRequestSchema = z
  .object({
    orgId: z.string().min(1),
    taskId: z.string().min(1),
    automationId: z.string().min(1),
  })
  .passthrough();

function getEnterpriseChatUrl() {
  const enterpriseApiUrl = process.env.NEXT_PUBLIC_ENTERPRISE_API_URL || 'http://localhost:3006';
  return new URL('/api/tasks-automations/chat', enterpriseApiUrl);
}

function responseHeadersFrom(upstream: Response) {
  const headers = new Headers();
  const allowedHeaders = ['content-type', 'cache-control', 'x-vercel-ai-ui-message-stream'];

  for (const headerName of allowedHeaders) {
    const headerValue = upstream.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return headers;
}

export async function POST(req: Request) {
  const permission = await requireApiPermission(req, 'task', 'update');
  if (permission instanceof NextResponse) {
    return permission;
  }

  const enterpriseApiKey = process.env.ENTERPRISE_API_SECRET;
  if (!enterpriseApiKey) {
    return NextResponse.json(
      { error: 'Task automations require an enterprise license.' },
      { status: 403 },
    );
  }

  let body: z.infer<typeof chatRequestSchema>;
  try {
    const parsed = chatRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid chat request.' }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (body.orgId !== permission.organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const upstream = await fetch(getEnterpriseChatUrl().toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': enterpriseApiKey,
      },
      body: JSON.stringify(body),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeadersFrom(upstream),
    });
  } catch (error) {
    console.error('[tasks-automations/chat] Enterprise API request failed:', error);
    return NextResponse.json(
      { error: 'Automation generation is currently unavailable.' },
      { status: 502 },
    );
  }
}
