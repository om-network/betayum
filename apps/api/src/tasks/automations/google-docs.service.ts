import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { CredentialVaultService } from '../../integration-platform/services/credential-vault.service';
import { OAuthCredentialsService } from '../../integration-platform/services/oauth-credentials.service';
import { ConnectionService } from '../../integration-platform/services/connection.service';

interface DocsCreateResponse {
  documentId: string;
}

interface DocsErrorResponse {
  error?: { message?: string };
}

@Injectable()
export class GoogleDocsService {
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

  private async docsRequest<T>(
    url: string,
    method: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as DocsErrorResponse;
      throw new BadGatewayException(err.error?.message ?? `Google Docs API error: ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  async createDocument({ organizationId, title, content }: {
    organizationId: string;
    title: string;
    content: string;
  }): Promise<{ documentId: string; documentUrl: string }> {
    const token = await this.resolveAccessToken(organizationId);

    const created = await this.docsRequest<DocsCreateResponse>(
      'https://docs.googleapis.com/v1/documents',
      'POST',
      token,
      { title },
    );

    const { documentId } = created;

    await this.docsRequest<unknown>(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      'POST',
      token,
      {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    );

    return {
      documentId,
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  }

  async appendToDocument({ organizationId, documentId, content }: {
    organizationId: string;
    documentId: string;
    content: string;
  }): Promise<{ success: true }> {
    const token = await this.resolveAccessToken(organizationId);

    await this.docsRequest<unknown>(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      'POST',
      token,
      {
        requests: [
          {
            insertText: {
              endOfSegmentLocation: { segmentId: '' },
              text: `\n${content}`,
            },
          },
        ],
      },
    );

    return { success: true };
  }
}
