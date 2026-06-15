import { isMissingObjectError } from './object-storage-errors';

describe('isMissingObjectError', () => {
  it('matches object-not-found errors', () => {
    expect(
      isMissingObjectError(
        Object.assign(new Error('missing'), {
          name: 'NoSuchKey',
        }),
      ),
    ).toBe(true);

    expect(
      isMissingObjectError(
        Object.assign(new Error('Not found'), {
          name: 'NotFound',
        }),
      ),
    ).toBe(true);

    expect(isMissingObjectError(new Error('No such object: bucket/key'))).toBe(
      true,
    );
  });

  it('does not match bucket or raw HTTP 404 configuration errors', () => {
    expect(
      isMissingObjectError(
        Object.assign(new Error('NoSuchBucket'), {
          name: 'NoSuchBucket',
          code: 404,
        }),
      ),
    ).toBe(false);

    expect(
      isMissingObjectError(
        Object.assign(new Error('Not found: Bucket betayum-missing'), {
          code: 404,
        }),
      ),
    ).toBe(false);
  });
});
