import { describeServer } from './server-description';

describe('describeServer', () => {
  it.each([
    ['https://api.staging.betayum.com', 'Staging API Server'],
    ['https://api.betayum.com', 'Production API Server'],
    ['http://localhost:3333', 'Local API Server'],
    ['http://127.0.0.1:3333', 'Local API Server'],
    ['http://[::1]:3333', 'Local API Server'],
  ])('labels trusted API host %s', (baseUrl, expected) => {
    expect(describeServer(baseUrl)).toBe(expected);
  });

  it.each([
    'https://api.betayum.com.evil.test',
    'https://evil.test/?next=https://api.betayum.com',
    'https://evil-api.betayum.com',
    'api.betayum.com',
  ])('does not label spoofed host %s as a trusted server', (baseUrl) => {
    expect(describeServer(baseUrl)).toBe('API Server');
  });
});
