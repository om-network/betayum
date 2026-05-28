'use server';

import { auth as triggerAuth, tasks } from '@trigger.dev/sdk';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { getRequestOrganizationId } from '@/lib/request-organization';

interface PreviewInput {
  connectionId: string;
  checkResultId: string;
  remediationKey: string;
  cachedPermissions?: string[];
}

export async function startPreview(
  input: PreviewInput,
): Promise<{ data?: { runId: string; accessToken: string }; error?: string }> {
  try {
    const organizationId = await getRequestOrganizationId();
    if (!organizationId) return { error: 'No organization context' };

    const context = await resolveCurrentUserOrganizationContext(organizationId);
    if (!context || !hasPermission(context.permissions, 'integration', 'update')) {
      return { error: 'Unauthorized' };
    }

    const handle = await tasks.trigger('remediate-preview', {
      connectionId: input.connectionId,
      organizationId,
      checkResultId: input.checkResultId,
      remediationKey: input.remediationKey,
      userId: context.userId,
      cachedPermissions: input.cachedPermissions,
    });

    const accessToken = await triggerAuth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
    });

    return { data: { runId: handle.id, accessToken } };
  } catch (err) {
    console.error('Failed to start preview:', err);
    return { error: err instanceof Error ? err.message : 'Failed to load preview' };
  }
}

interface SingleFixInput {
  connectionId: string;
  checkResultId: string;
  remediationKey: string;
  acknowledgment?: string;
}

export async function startSingleFix(
  input: SingleFixInput,
): Promise<{ data?: { runId: string; accessToken: string }; error?: string }> {
  try {
    const organizationId = await getRequestOrganizationId();
    if (!organizationId) return { error: 'No organization context' };

    const context = await resolveCurrentUserOrganizationContext(organizationId);
    if (!context || !hasPermission(context.permissions, 'integration', 'update')) {
      return { error: 'Unauthorized' };
    }

    const handle = await tasks.trigger('remediate-single', {
      connectionId: input.connectionId,
      organizationId,
      checkResultId: input.checkResultId,
      remediationKey: input.remediationKey,
      userId: context.userId,
      acknowledgment: input.acknowledgment,
    });

    const accessToken = await triggerAuth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
    });

    return { data: { runId: handle.id, accessToken } };
  } catch (err) {
    console.error('Failed to start single fix:', err);
    return { error: err instanceof Error ? err.message : 'Failed to start fix' };
  }
}
