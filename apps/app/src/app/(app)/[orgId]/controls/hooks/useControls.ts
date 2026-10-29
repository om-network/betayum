'use client';

import { apiClient } from '@/lib/api-client';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import type { ControlWithRelations } from '../data/queries';

interface ControlsApiResponse {
  data: ControlWithRelations[];
  pageCount: number;
}

type RequirementMappingPayload =
  | { requirementId: string; customRequirementId?: never; frameworkInstanceId: string }
  | { requirementId?: never; customRequirementId: string; frameworkInstanceId: string };

interface CreateControlPayload {
  name: string;
  description: string;
  policyIds?: string[];
  taskIds?: string[];
  requirementMappings?: RequirementMappingPayload[];
  documentTypes?: string[];
}

export const controlsKey = (organizationId: string) => ['/v1/controls', organizationId] as const;

interface UseControlsOptions {
  initialData?: ControlWithRelations[];
}

export function useControls(options?: UseControlsOptions) {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { initialData } = options ?? {};

  const { data, error, isLoading, mutate } = useSWR(
    controlsKey(orgId),
    async () => {
      const response = await apiClient.get<ControlsApiResponse>('/v1/controls', orgId);
      if (response.error) throw new Error(response.error);
      if (!response.data?.data) return [];
      return response.data.data;
    },
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData,
      revalidateOnFocus: false,
    },
  );

  const controls = Array.isArray(data) ? data : [];

  const createControl = async (payload: CreateControlPayload) => {
    let requirementMappings = payload.requirementMappings;
    if (requirementMappings?.length) {
      const options = await apiClient.get<{
        requirements: Array<{ id: string; frameworkInstanceId: string; isCustom: boolean }>;
      }>('/v1/controls/options', orgId);
      if (options.error || !options.data) throw new Error('Unable to load requirement mappings');
      requirementMappings = requirementMappings.map((mapping) => {
        const custom = options.data?.requirements.find(
          (requirement) =>
            requirement.isCustom &&
            requirement.id === mapping.requirementId &&
            requirement.frameworkInstanceId === mapping.frameworkInstanceId,
        );
        return custom
          ? { customRequirementId: custom.id, frameworkInstanceId: mapping.frameworkInstanceId }
          : mapping;
      });
    }
    const response = await apiClient.post(
      '/v1/controls',
      { ...payload, requirementMappings },
      orgId,
    );
    if (response.error) throw new Error(response.error);
    await mutate();
    router.refresh();
    return response.data;
  };

  const deleteControl = async (id: string) => {
    const previous = controls;

    // Optimistic removal
    await mutate(
      controls.filter((c) => c.id !== id),
      false,
    );

    try {
      const response = await apiClient.delete(`/v1/controls/${id}`, orgId);
      if (response.error) throw new Error(response.error);
      await mutate();
    } catch (err) {
      // Rollback on error
      await mutate(previous, false);
      throw err;
    }
  };

  return {
    controls,
    isLoading: isLoading && !data,
    error,
    mutate,
    createControl,
    deleteControl,
  };
}
