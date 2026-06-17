import { describe, expect, it } from 'bun:test';
import { extractS3KeyFromUrl } from './s3';

describe('extractS3KeyFromUrl', () => {
  it('rejects object-storage lookalike domains without blocking ordinary keys', () => {
    expect(() =>
      extractS3KeyFromUrl('https://example.com/storage.googleapis.com/bucket/key.pdf'),
    ).toThrow('Invalid URL: Not a valid object storage endpoint');
    expect(() =>
      extractS3KeyFromUrl('storage.googleapis.com/bucket/key.pdf'),
    ).toThrow('Invalid input: Domain-like pattern detected in S3 key');
    expect(() =>
      extractS3KeyFromUrl('bucket.s3.amazonaws.com/key.pdf'),
    ).toThrow('Invalid input: Domain-like pattern detected in S3 key');

    expect(extractS3KeyFromUrl('reports/storage.googleapis.com-reference.pdf')).toBe(
      'reports/storage.googleapis.com-reference.pdf',
    );
    expect(extractS3KeyFromUrl('reports/amazonaws.com-reference.pdf')).toBe(
      'reports/amazonaws.com-reference.pdf',
    );
  });
});
