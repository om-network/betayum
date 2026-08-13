import { describe, expect, it } from 'vitest';
import { getAutomationProvider, isTaskAutomatable } from './automation-eligibility';

describe('automation eligibility', () => {
  it.each([
    ['App Availability', 'gcp'],
    ['Encryption at Rest', 'gcp'],
    ['Production Firewall & No-Public-Access Controls', 'gcp'],
    ['Separation of Environments', 'gcp'],
    ['Code Changes', 'github'],
    ['Sanitized Inputs', 'github'],
    ['Static Code Scanning  ', 'github'],
  ] as const)('allows %s through %s', (title, provider) => {
    expect(getAutomationProvider(title)).toBe(provider);
  });

  it.each([
    'Office Access & Door Monitoring',
    'Device List',
    'Secure Devices',
    'Employee Access',
    'Planning',
  ])('excludes %s', (title) => {
    expect(isTaskAutomatable(title)).toBe(false);
  });
});
