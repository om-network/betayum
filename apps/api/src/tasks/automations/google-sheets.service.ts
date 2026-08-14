import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CredentialVaultService } from '../../integration-platform/services/credential-vault.service';
import { OAuthCredentialsService } from '../../integration-platform/services/oauth-credentials.service';
import { ConnectionService } from '../../integration-platform/services/connection.service';

interface SheetsCreateResponse {
  spreadsheetId: string;
}

interface SheetsValuesResponse {
  values?: (string | number)[][];
}

interface SheetsErrorResponse {
  error?: { message?: string };
}

type CellRow = (string | number)[];

@Injectable()
export class GoogleSheetsService {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly oauthCredentialsService: OAuthCredentialsService,
    private readonly credentialVaultService: CredentialVaultService,
  ) {}

  private async resolveAccessToken(organizationId: string): Promise<string> {
    const connection = await this.connectionService.getConnectionByProviderSlug('gcp', organizationId);
    if (!connection || connection.status !== 'active') {
      throw new NotFoundException('No active GCP integration connection found');
    }

    const oauthCreds = await this.oauthCredentialsService.getCredentials('gcp', organizationId);
    if (!oauthCreds) {
      throw new NotFoundException('GCP OAuth credentials not found');
    }

    const token = await this.credentialVaultService.getValidAccessToken(connection.id, {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: oauthCreds.clientId,
      clientSecret: oauthCreds.clientSecret,
      clientAuthMethod: 'body',
    });

    if (!token) {
      throw new NotFoundException('Could not obtain a valid GCP access token');
    }

    return token;
  }

  private assertGoogleId(value: string, name: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      throw new BadRequestException(`Invalid ${name} format`);
    }
  }

  private assertA1Range(value: string): void {
    if (!/^[A-Za-z0-9 :!.]{1,200}$/.test(value)) {
      throw new BadRequestException('Invalid range format');
    }
  }

  private assertGoogleSheetsApiPath(path: string): string {
    if (path !== '/v4/spreadsheets' && !path.startsWith('/v4/spreadsheets/')) {
      throw new BadRequestException('Invalid Google Sheets API path');
    }

    if (path.includes('://') || path.includes('..') || path.includes('#') || path.includes('\\')) {
      throw new BadRequestException('Invalid Google Sheets API path');
    }

    return path;
  }

  private async sheetsRequest<T>(
    path: string,
    method: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    const safePath = this.assertGoogleSheetsApiPath(path);
    const url = new URL(safePath, 'https://sheets.googleapis.com');
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as SheetsErrorResponse;
      throw new BadGatewayException(err.error?.message ?? `Google Sheets API error: ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  async createSpreadsheet({ organizationId, title, headers, rows }: {
    organizationId: string;
    title: string;
    headers?: CellRow;
    rows: CellRow[];
  }): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    const token = await this.resolveAccessToken(organizationId);

    const created = await this.sheetsRequest<SheetsCreateResponse>(
      '/v4/spreadsheets',
      'POST',
      token,
      { properties: { title } },
    );

    const { spreadsheetId } = created;
    const values: CellRow[] = [...(headers ? [headers] : []), ...rows];

    await this.sheetsRequest<unknown>(
      `/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW`,
      'POST',
      token,
      { values },
    );

    return {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    };
  }

  async readValues({ organizationId, spreadsheetId, range }: {
    organizationId: string;
    spreadsheetId: string;
    range?: string;
  }): Promise<{ spreadsheetId: string; values: (string | number)[][] }> {
    this.assertGoogleId(spreadsheetId, 'spreadsheetId');
    const token = await this.resolveAccessToken(organizationId);
    const effectiveRange = range ?? 'A1:Z10000';
    this.assertA1Range(effectiveRange);

    const result = await this.sheetsRequest<SheetsValuesResponse>(
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(effectiveRange)}`,
      'GET',
      token,
    );

    return { spreadsheetId, values: result.values ?? [] };
  }

  async appendRows({ organizationId, spreadsheetId, rows }: {
    organizationId: string;
    spreadsheetId: string;
    rows: CellRow[];
  }): Promise<{ success: true }> {
    this.assertGoogleId(spreadsheetId, 'spreadsheetId');
    const token = await this.resolveAccessToken(organizationId);

    await this.sheetsRequest<unknown>(
      `/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW`,
      'POST',
      token,
      { values: rows },
    );

    return { success: true };
  }
}
