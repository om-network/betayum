import { describe, expect, it } from 'vitest';
import { parseControlQuery } from './control-query';

describe('control list query', () => {
  it('preserves valid server pagination, search, and sorting', () => {
    expect(
      parseControlQuery({ page: '3', perPage: '50', name: ' Access ', sortDesc: 'true' }),
    ).toEqual({ page: 3, perPage: 50, name: 'Access', sortDesc: 'true' });
  });
  it('bounds unsupported or malicious pagination values', () => {
    expect(
      parseControlQuery({
        page: '-1',
        perPage: '1000000',
        name: ['invalid'],
        sortDesc: 'DROP TABLE',
      }),
    ).toEqual({ page: 1, perPage: 20, name: '', sortDesc: 'false' });
  });
});
