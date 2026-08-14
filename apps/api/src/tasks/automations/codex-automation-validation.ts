import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const MAX_SCREENSHOTS_TOTAL_BYTES = 50 * 1024 * 1024;

export function validateScreenshot({
  bytes,
  fileName,
  mimeType,
}: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}): { checksumSha256: string; extension: 'jpg' | 'png' } {
  if (
    !fileName ||
    path.basename(fileName) !== fileName ||
    fileName.includes('\0')
  ) {
    throw new BadRequestException('Invalid screenshot filename');
  }
  if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES) {
    throw new BadRequestException('Screenshot exceeds the 10 MB limit');
  }

  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const isJpeg =
    bytes.length >= 3 &&
    bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (
    (mimeType === 'image/png' && !isPng) ||
    (mimeType === 'image/jpeg' && !isJpeg)
  ) {
    throw new BadRequestException('Screenshot signature does not match MIME type');
  }

  return {
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    extension: mimeType === 'image/png' ? 'png' : 'jpg',
  };
}
