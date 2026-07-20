import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CredentialVaultService } from '../../integration-platform/services/credential-vault.service';
import { OAuthCredentialsService } from '../../integration-platform/services/oauth-credentials.service';
import { ConnectionService } from '../../integration-platform/services/connection.service';

interface DocsCreateResponse {
  documentId: string;
}

interface DocsErrorResponse {
  error?: { message?: string };
}

interface DocsTextRun {
  content: string;
}

interface DocsParagraphElement {
  textRun?: DocsTextRun;
}

interface DocsParagraph {
  elements: DocsParagraphElement[];
}

interface DocsStructuralElement {
  paragraph?: DocsParagraph;
}

interface DocsReadResponse {
  documentId: string;
  title: string;
  body: { content: DocsStructuralElement[] };
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

  private assertGoogleId(value: string, name: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      throw new BadRequestException(`Invalid ${name} format`);
    }
  }

  private async docsRequest<T>(
    path: string,
    method: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`https://docs.googleapis.com${path}`, {
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
      '/v1/documents',
      'POST',
      token,
      { title },
    );

    const { documentId } = created;

    await this.docsRequest<unknown>(
      `/v1/documents/${documentId}:batchUpdate`,
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

  async readDocument({ organizationId, documentId }: {
    organizationId: string;
    documentId: string;
  }): Promise<{ documentId: string; title: string; content: string }> {
    this.assertGoogleId(documentId, 'documentId');
    const token = await this.resolveAccessToken(organizationId);

    const doc = await this.docsRequest<DocsReadResponse>(
      `/v1/documents/${documentId}`,
      'GET',
      token,
    );

    const content = doc.body.content
      .flatMap((el) => el.paragraph?.elements ?? [])
      .map((el) => el.textRun?.content ?? '')
      .join('');

    return { documentId: doc.documentId, title: doc.title, content };
  }

  async appendToDocument({ organizationId, documentId, content }: {
    organizationId: string;
    documentId: string;
    content: string;
  }): Promise<{ success: true }> {
    this.assertGoogleId(documentId, 'documentId');
    const token = await this.resolveAccessToken(organizationId);

    await this.docsRequest<unknown>(
      `/v1/documents/${documentId}:batchUpdate`,
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
