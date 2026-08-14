import { Test } from '@nestjs/testing';
import { CredentialVaultService } from './credential-vault.service';
import { OAuthCredentialsService } from './oauth-credentials.service';
import { OAuthAppRepository } from '../repositories/oauth-app.repository';
import { PlatformCredentialRepository } from '../repositories/platform-credential.repository';

describe('OAuthCredentialsService environment credentials', () => {
  const originalClientId = process.env.GCP_OAUTH_CLIENT_ID;
  const originalClientSecret = process.env.GCP_OAUTH_CLIENT_SECRET;
  let service: OAuthCredentialsService;

  beforeEach(async () => {
    process.env.GCP_OAUTH_CLIENT_ID = 'staging-gcp-client';
    process.env.GCP_OAUTH_CLIENT_SECRET = 'staging-gcp-secret';

    const module = await Test.createTestingModule({
      providers: [
        OAuthCredentialsService,
        {
          provide: OAuthAppRepository,
          useValue: {
            findActiveByProviderAndOrg: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PlatformCredentialRepository,
          useValue: {
            findActiveByProviderSlug: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: CredentialVaultService, useValue: {} },
      ],
    }).compile();

    service = module.get(OAuthCredentialsService);
  });

  afterEach(() => {
    if (originalClientId === undefined) delete process.env.GCP_OAUTH_CLIENT_ID;
    else process.env.GCP_OAUTH_CLIENT_ID = originalClientId;

    if (originalClientSecret === undefined)
      delete process.env.GCP_OAUTH_CLIENT_SECRET;
    else process.env.GCP_OAUTH_CLIENT_SECRET = originalClientSecret;
  });

  it('makes GCP available when Cloud Run injects platform OAuth credentials', async () => {
    await expect(service.checkAvailability('gcp', '')).resolves.toMatchObject({
      available: true,
      hasPlatformCredentials: true,
    });
  });

  it('uses injected GCP credentials when no database credential exists', async () => {
    await expect(service.getCredentials('gcp', '')).resolves.toMatchObject({
      clientId: 'staging-gcp-client',
      clientSecret: 'staging-gcp-secret',
      source: 'platform',
    });
  });
});
