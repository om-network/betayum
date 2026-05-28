export interface ClerkWebhookResult {
  handled: boolean;
  issues: string[];
}

export interface ClerkReconciliationReport {
  organizationId: string;
  clerkOrganizationId: string | null;
  missingLocalLinks: string[];
  orphanedLocalProfiles: string[];
  roleMismatches: Array<{
    memberId: string;
    clerkUserId: string;
    localRole: string;
    clerkRole: string;
  }>;
  invitationDrift: string[];
  unmappedPermissions: string[];
}
