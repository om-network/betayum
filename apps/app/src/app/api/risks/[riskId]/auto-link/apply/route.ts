import { serverApi } from '@/lib/api-server';
import { NextRequest, NextResponse } from 'next/server';

interface ApplyTaskLinksResponse {
  linked: number;
}

/**
 * POST /api/risks/[riskId]/auto-link/apply
 *
 * Persists the user-confirmed task selection from the AI-suggestion review UI.
 *
 * - `replace: true` -> re-assess flow (sync semantics: connect-only-these tasks).
 * - `replace: false` -> fresh suggest flow (additive: connect these to whatever's
 *   already linked).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ riskId: string }> }) {
  try {
    const { riskId } = await params;
    if (!riskId) {
      return NextResponse.json({ error: 'Risk ID is required' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const response = await serverApi.post<ApplyTaskLinksResponse>(
      `/v1/risks/${riskId}/auto-link/apply`,
      body,
    );

    if (response.error) {
      return NextResponse.json({ error: response.error }, { status: response.status || 500 });
    }

    return NextResponse.json(response.data ?? { linked: 0 });
  } catch (error) {
    console.error('Error applying risk auto-link:', error);
    return NextResponse.json({ error: 'Failed to apply auto-link' }, { status: 500 });
  }
}
