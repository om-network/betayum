export const AUTOMATION_ORGANIZATION_QUEUE = 'organization-automation';

export function automationOrganizationQueue(organizationId: string) {
  return {
    concurrencyKey: organizationId,
    queue: AUTOMATION_ORGANIZATION_QUEUE,
  } as const;
}
