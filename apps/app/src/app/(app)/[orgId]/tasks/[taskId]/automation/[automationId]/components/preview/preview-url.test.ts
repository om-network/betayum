import { describe, expect, it } from 'vitest';
import { toSafePreviewUrl } from './preview-url';

describe('toSafePreviewUrl', () => {
  it('allows http and https preview URLs', () => {
    expect(toSafePreviewUrl('https://example.com/path')?.toString()).toBe(
      'https://example.com/path',
    );
    expect(toSafePreviewUrl('http://localhost:3000')?.toString()).toBe('http://localhost:3000/');
  });

  it('rejects scriptable or malformed preview URLs', () => {
    expect(toSafePreviewUrl('javascript:alert(1)')).toBeNull();
    expect(toSafePreviewUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(toSafePreviewUrl('not a url')).toBeNull();
  });
});
