import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_ORGANIZATION_QUEUE,
  automationOrganizationQueue,
} from './automation-organization-queue';

describe(automationOrganizationQueue.name, () => {
  it('creates one concurrency lane per organization', () => {
    expect(automationOrganizationQueue('org_1')).toEqual({
      concurrencyKey: 'org_1',
      queue: AUTOMATION_ORGANIZATION_QUEUE,
    });
    expect(automationOrganizationQueue('org_2').concurrencyKey).toBe('org_2');
  });
});
