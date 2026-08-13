import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDelete } = vi.hoisted(() => ({ mockDelete: vi.fn() }));
vi.mock('@/lib/api-server', () => ({ serverApi: { delete: mockDelete } }));

import { DELETE } from './route';

const request = new NextRequest('http://localhost/api/invitations/inv_123', { method: 'DELETE' });
const params = { params: Promise.resolve({ id: 'inv_123' }) };

describe('DELETE /api/invitations/[id]', () => {
  it('delegates authorization and mutation to the Nest API', async () => {
    mockDelete.mockResolvedValue({ data: { success: true }, status: 200 });

    const response = await DELETE(request, params);

    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith('/v1/auth/invitations/inv_123');
  });

  it('forwards read-only permission denial', async () => {
    mockDelete.mockResolvedValue({ error: 'Forbidden', status: 403 });

    const response = await DELETE(request, params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });
});
