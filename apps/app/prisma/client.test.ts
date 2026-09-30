import { describe, expect, it } from 'vitest';
import { shouldUseTls } from './client';

describe('shouldUseTls', () => {
  it('honors sslmode=disable for the Cloud SQL Auth Proxy', () => {
    expect(shouldUseTls('postgresql://u:p@cloud-sql-proxy:5432/x?sslmode=disable')).toBe(false);
  });

  it('uses TLS for remote databases by default', () => {
    expect(shouldUseTls('postgresql://u:p@db.prod.example.com:5432/x')).toBe(true);
  });
});
