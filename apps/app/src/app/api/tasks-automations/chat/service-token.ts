import { timingSafeEqual } from 'node:crypto';

export function isTriggerServiceToken(value: string | null): boolean {
  const expected = process.env.SERVICE_TOKEN_TRIGGER;
  if (!value || !expected) return false;
  const receivedBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected.replace(/\r?\n$/, ''));
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
