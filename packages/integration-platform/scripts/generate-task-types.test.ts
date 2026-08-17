import { describe, expect, it } from 'bun:test';
import { toTaskTemplateKey, toTsStringLiteral } from './generate-task-types';

describe('toTsStringLiteral', () => {
  it('serializes task metadata as safe TypeScript string literals', () => {
    expect(toTsStringLiteral("owner's laptop\\desktop\n${notAPlaceholder}<script>")).toBe(
      '"owner\'s laptop\\\\desktop\\n${notAPlaceholder}<script>"',
    );
  });
});

describe('toTaskTemplateKey', () => {
  it('preserves the existing two-factor auth identifier for 2FA task names', () => {
    expect(toTaskTemplateKey('2FA')).toBe('twoFactorAuth');
  });
});
