import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'automation_generation_unavailable',
      message:
        'First-party automation generation is not available yet. Drafts, publish, and manual runs remain first-party scoped.',
    },
    { status: 503 },
  );
}
