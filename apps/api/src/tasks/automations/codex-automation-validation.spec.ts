import { BadRequestException } from '@nestjs/common';
import {
  MAX_SCREENSHOT_BYTES,
  validateScreenshot,
} from './codex-automation-validation';

describe('validateScreenshot', () => {
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const jpeg = Buffer.from('ffd8ffdb00000000', 'hex');

  it('accepts PNG and JPEG signatures and returns a checksum', () => {
    expect(
      validateScreenshot({
        bytes: png,
        fileName: 'evidence.png',
        mimeType: 'image/png',
      }),
    ).toEqual({
      checksumSha256:
        '1b56b50ac4e976f488f128cabdcdffb2fc9331d6974bb9968131a415d14ade24',
      extension: 'png',
    });
    expect(
      validateScreenshot({
        bytes: jpeg,
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg',
      }).extension,
    ).toBe('jpg');
  });

  it.each([
    ['nested/file.png', png, 'image/png'],
    ['evidence.png', jpeg, 'image/png'],
    ['evidence.jpg', png, 'image/jpeg'],
  ])('rejects invalid evidence %s', (fileName, bytes, mimeType) => {
    expect(() => validateScreenshot({ bytes, fileName, mimeType })).toThrow(
      BadRequestException,
    );
  });

  it('rejects files larger than 10 MB', () => {
    const oversized = Buffer.alloc(MAX_SCREENSHOT_BYTES + 1);
    oversized.set(png.subarray(0, 8));

    expect(() =>
      validateScreenshot({
        bytes: oversized,
        fileName: 'large.png',
        mimeType: 'image/png',
      }),
    ).toThrow(BadRequestException);
  });
});
