import { apiClient } from '@/lib/api-client';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useControls } from './useControls';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org_route' }),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('swr', () => ({ default: () => ({ data: [], mutate: mocks.mutate }) }));

describe('control creation', () => {
  it('preserves custom requirement mappings, tenant context and refreshes the list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        requirements: [{ id: 'custom_1', frameworkInstanceId: 'framework_1', isCustom: true }],
      },
      status: 200,
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'control_1' }, status: 201 });
    const { result } = renderHook(() => useControls());
    await act(async () => {
      await result.current.createControl({
        name: 'Custom control',
        description: 'Description',
        requirementMappings: [{ requirementId: 'custom_1', frameworkInstanceId: 'framework_1' }],
      });
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/controls',
      expect.objectContaining({
        requirementMappings: [
          { customRequirementId: 'custom_1', frameworkInstanceId: 'framework_1' },
        ],
      }),
      'org_route',
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
