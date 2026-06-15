import { BadRequestException } from '@nestjs/common';
import { validateBillingRedirectUrl } from './billing-redirect-urls';

describe('validateBillingRedirectUrl', () => {
  it('allows Betayum app redirect hosts', () => {
    expect(() =>
      validateBillingRedirectUrl('https://app.betayum.com/org_1/billing'),
    ).not.toThrow();

    expect(() =>
      validateBillingRedirectUrl(
        'https://app.staging.betayum.com/org_1/billing',
      ),
    ).not.toThrow();
  });

  it('allows http only for local development hosts', () => {
    expect(() =>
      validateBillingRedirectUrl('http://localhost:3000/org_1/billing'),
    ).not.toThrow();

    expect(() =>
      validateBillingRedirectUrl('http://app.trycomp.ai/org_1/billing'),
    ).toThrow(BadRequestException);
  });
});
