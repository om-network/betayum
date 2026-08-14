import { serverApi } from '@/lib/api-server';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await serverApi.delete<{ success: true }>(`/v1/auth/invitations/${id}`);
  if (response.error) {
    return NextResponse.json({ error: response.error }, { status: response.status || 500 });
  }
  return NextResponse.json(response.data);
}
