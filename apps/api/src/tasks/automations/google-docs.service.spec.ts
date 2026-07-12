import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GoogleDocsService } from './google-docs.service';
import { ConnectionService } from '../../integration-platform/services/connection.service';
import { OAuthCredentialsService } from '../../integration-platform/services/oauth-credentials.service';
import { CredentialVaultService } from '../../integration-platform/services/credential-vault.service';

jest.mock('@db', () => ({ db: {} }));
jest.mock('../../integration-platform/services/connection.service');
jest.mock('../../integration-platform/services/oauth-credentials.service');
jest.mock('../../integration-platform/services/credential-vault.service');

const ORG_ID = 'org_test';
const TOKEN = 'ya29.test_token';
const ACTIVE_CONNECTION = { id: 'conn_1', status: 'active' };
const OAUTH_CREDS = { clientId: 'cid', clientSecret: 'csec' };

describe('GoogleDocsService', () => {
  let service: GoogleDocsService;
  let connectionService: jest.Mocked<ConnectionService>;
  let oauthCredentialsService: jest.Mocked<OAuthCredentialsService>;
  let credentialVaultService: jest.Mocked<CredentialVaultService>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        GoogleDocsService,
        ConnectionService,
        OAuthCredentialsService,
        CredentialVaultService,
      ],
    }).compile();

    service = module.get(GoogleDocsService);
    connectionService = module.get(ConnectionService) as jest.Mocked<ConnectionService>;
    oauthCredentialsService = module.get(OAuthCredentialsService) as jest.Mocked<OAuthCredentialsService>;
    credentialVaultService = module.get(CredentialVaultService) as jest.Mocked<CredentialVaultService>;

    connectionService.getConnectionByProviderSlug = jest.fn().mockResolvedValue(ACTIVE_CONNECTION);
    oauthCredentialsService.getCredentials = jest.fn().mockResolvedValue(OAUTH_CREDS);
    credentialVaultService.getValidAccessToken = jest.fn().mockResolvedValue(TOKEN);

    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('createDocument', () => {
    it('creates a document and returns documentId + url', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ documentId: 'doc_abc' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        } as Response);

      const result = await service.createDocument({
        organizationId: ORG_ID,
        title: 'Test Evidence',
        content: 'Evidence content here',
      });

      expect(result).toEqual({
        documentId: 'doc_abc',
        documentUrl: 'https://docs.google.com/document/d/doc_abc/edit',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [createUrl, createOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(createUrl).toBe('https://docs.googleapis.com/v1/documents');
      expect(createOpts.method).toBe('POST');
      expect(JSON.parse(createOpts.body as string)).toEqual({ title: 'Test Evidence' });

      const [updateUrl, updateOpts] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(updateUrl).toBe('https://docs.googleapis.com/v1/documents/doc_abc:batchUpdate');
      expect(updateOpts.method).toBe('POST');
      const updateBody = JSON.parse(updateOpts.body as string) as { requests: unknown[] };
      expect(updateBody.requests).toHaveLength(1);
    });
  });

  describe('appendToDocument', () => {
    it('appends content and returns success', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const result = await service.appendToDocument({
        organizationId: ORG_ID,
        documentId: 'doc_xyz',
        content: 'Appended text',
      });

      expect(result).toEqual({ success: true });

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://docs.googleapis.com/v1/documents/doc_xyz:batchUpdate');
      const body = JSON.parse(opts.body as string) as { requests: Array<{ insertText: { text: string } }> };
      expect(body.requests[0].insertText.text).toBe('\nAppended text');
    });
  });

  describe('no active connection', () => {
    it('throws NotFoundException when no GCP connection found', async () => {
      connectionService.getConnectionByProviderSlug = jest.fn().mockResolvedValue(null);

      await expect(
        service.createDocument({ organizationId: ORG_ID, title: 'T', content: 'C' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when connection status is not active', async () => {
      connectionService.getConnectionByProviderSlug = jest.fn().mockResolvedValue({
        id: 'conn_1',
        status: 'inactive',
      });

      await expect(
        service.createDocument({ organizationId: ORG_ID, title: 'T', content: 'C' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Google API error propagation', () => {
    it('throws with the Google error message when API returns non-ok', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'The caller does not have permission' } }),
      } as Response);

      await expect(
        service.createDocument({ organizationId: ORG_ID, title: 'T', content: 'C' }),
      ).rejects.toThrow('The caller does not have permission');
    });
  });
});
