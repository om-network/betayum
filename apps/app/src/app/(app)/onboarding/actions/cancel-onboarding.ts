'use server';

import { authActionClientWithoutOrg } from '@/actions/safe-action';
import { setActiveOrganizationCookie } from '@/lib/active-organization';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { db } from '@db/server';
import { z } from 'zod';

const cancelSchema = z.object({
  organizationId: z.string().min(1),
});

export const cancelOnboarding = authActionClientWithoutOrg
  .inputSchema(cancelSchema)
  .metadata({
    name: 'cancel-onboarding',
    track: {
      event: 'cancel-onboarding',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    if (!ctx.user) {
      return { success: false, error: 'Not authorized.' };
    }

    const context = await resolveCurrentUserOrganizationContext(parsedInput.organizationId);
    if (!context || !hasPermission(context.permissions, 'organization', 'delete')) {
      return { success: false, error: 'Only the owner can cancel onboarding.' };
    }

    // Verify the org belongs to this user and is still incomplete.
    const member = await db.member.findFirst({
      where: {
        userId: ctx.user.id,
        organizationId: parsedInput.organizationId,
        deactivated: false,
      },
      include: { organization: { select: { onboardingCompleted: true } } },
    });

    if (!member) {
      return { success: false, error: 'Only the owner can cancel onboarding.' };
    }

    if (member.organization.onboardingCompleted) {
      return { success: false, error: 'Cannot cancel a completed organization.' };
    }

    // Find a fallback org to switch to BEFORE deleting
    const fallbackOrg = await db.member.findFirst({
      where: {
        userId: ctx.user.id,
        organizationId: { not: parsedInput.organizationId },
        deactivated: false,
        organization: {
          onboardingCompleted: true,
          hasAccess: true,
        },
      },
      select: { organizationId: true },
      orderBy: { createdAt: 'desc' },
    });

    // Must have a fallback org — refuse to delete if there's nowhere to go.
    // The UI guards this too, but a race condition could remove fallback orgs
    // between page render and action execution.
    if (!fallbackOrg) {
      return { success: false, error: 'No other organization to switch to.' };
    }

    // Switch active org BEFORE deletion so route helpers never reference a deleted org.
    try {
      await setActiveOrganizationCookie(fallbackOrg.organizationId);
    } catch (error) {
      console.error('Failed to switch to fallback org:', error);
      return { success: false, error: 'Failed to switch organization.' };
    }

    // Delete the incomplete org (cascade handles related records).
    // If this fails, roll back the active org switch to keep state consistent.
    try {
      await db.organization.delete({
        where: { id: parsedInput.organizationId },
      });
    } catch (error) {
      console.error('Failed to delete organization:', error);
      try {
        await setActiveOrganizationCookie(parsedInput.organizationId);
      } catch (rollbackError) {
        console.error('Failed to rollback active org switch:', rollbackError);
      }
      return { success: false, error: 'Failed to cancel onboarding.' };
    }

    return {
      success: true,
      fallbackOrgId: fallbackOrg?.organizationId ?? null,
    };
  });
