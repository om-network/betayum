import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GoogleSheetsService } from './google-sheets.service';
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

describe('GoogleSheetsService', () => {
  let service: GoogleSheetsService;
  let connectionService: jest.Mocked<ConnectionService>;
  let oauthCredentialsService: jest.Mocked<OAuthCredentialsService>;
  let credentialVaultService: jest.Mocked<CredentialVaultService>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        GoogleSheetsService,
        ConnectionService,
        OAuthCredentialsService,
        CredentialVaultService,
      ],
    }).compile();

    service = module.get(GoogleSheetsService);
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

  describe('createSpreadsheet', () => {
    it('creates a spreadsheet with headers and rows, returns spreadsheetId + url', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ spreadsheetId: 'sheet_abc' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        } as Response);

      const result = await service.createSpreadsheet({
        organizationId: ORG_ID,
        title: 'Evidence Sheet',
        headers: ['Resource', 'Status'],
        rows: [['projects/foo', 'ok']],
      });

      expect(result).toEqual({
        spreadsheetId: 'sheet_abc',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_abc/edit',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const [createUrl, createOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(createUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets');
      expect(JSON.parse(createOpts.body as string)).toEqual({ properties: { title: 'Evidence Sheet' } });

      const [appendUrl, appendOpts] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(appendUrl).toContain('/values/A1:append');
      const appendBody = JSON.parse(appendOpts.body as string) as { values: unknown[][] };
      expect(appendBody.values).toEqual([['Resource', 'Status'], ['projects/foo', 'ok']]);
    });

    it('creates a spreadsheet without headers when not provided', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ spreadsheetId: 'sheet_no_headers' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        } as Response);

      await service.createSpreadsheet({
        organizationId: ORG_ID,
        title: 'No Headers Sheet',
        rows: [['data1', 'data2']],
      });

      const [, appendOpts] = fetchSpy.mock.calls[1] as [string, RequestInit];
      const appendBody = JSON.parse(appendOpts.body as string) as { values: unknown[][] };
      expect(appendBody.values).toEqual([['data1', 'data2']]);
    });
  });

  describe('appendRows', () => {
    it('appends rows and returns success', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const result = await service.appendRows({
        organizationId: ORG_ID,
        spreadsheetId: 'sheet_xyz',
        rows: [['row1col1', 'row1col2']],
      });

      expect(result).toEqual({ success: true });

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('sheet_xyz');
      expect(url).toContain('/values/A1:append');
    });
  });

  describe('no active connection', () => {
    it('throws NotFoundException when no GCP connection found', async () => {
      connectionService.getConnectionByProviderSlug = jest.fn().mockResolvedValue(null);

      await expect(
        service.createSpreadsheet({ organizationId: ORG_ID, title: 'T', rows: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when connection status is not active', async () => {
      connectionService.getConnectionByProviderSlug = jest.fn().mockResolvedValue({
        id: 'conn_1',
        status: 'inactive',
      });

      await expect(
        service.createSpreadsheet({ organizationId: ORG_ID, title: 'T', rows: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Google API error propagation', () => {
    it('throws with the Google error message when API returns non-ok', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Sheets API not enabled' } }),
      } as Response);

      await expect(
        service.createSpreadsheet({ organizationId: ORG_ID, title: 'T', rows: [] }),
      ).rejects.toThrow('Sheets API not enabled');
    });
  });

  describe('readValues', () => {
    it('returns spreadsheetId and values from the API response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [
            ['Name', 'Role'],
            ['alice', 'admin'],
            ['bob', 'viewer'],
          ],
        }),
      } as Response);

      const result = await service.readValues({
        organizationId: ORG_ID,
        spreadsheetId: 'sheet_read',
      });

      expect(result).toEqual({
        spreadsheetId: 'sheet_read',
        values: [['Name', 'Role'], ['alice', 'admin'], ['bob', 'viewer']],
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('sheet_read');
      expect(url).toContain(encodeURIComponent('A1:Z10000'));
      expect(opts.method).toBe('GET');
    });

    it('uses a custom range when provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [] }),
      } as Response);

      await service.readValues({
        organizationId: ORG_ID,
        spreadsheetId: 'sheet_read',
        range: 'Sheet2!A1:B5',
      });

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain(encodeURIComponent('Sheet2!A1:B5'));
    });

    it('returns empty values array when API omits the values field', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const result = await service.readValues({
        organizationId: ORG_ID,
        spreadsheetId: 'sheet_empty',
      });

      expect(result.values).toEqual([]);
    });

    it('throws BadGatewayException on Google API error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Insufficient permission to read sheet' } }),
      } as Response);

      await expect(
        service.readValues({ organizationId: ORG_ID, spreadsheetId: 'sheet_err' }),
      ).rejects.toThrow('Insufficient permission to read sheet');
    });
  });
});
