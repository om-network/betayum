import { describe, expect, it } from 'bun:test';
import { getBrandConfig } from './brand';

describe('getBrandConfig', () => {
  it('returns Betayum defaults for user-facing brand surfaces', () => {
    expect(getBrandConfig()).toEqual({
      displayName: 'Betayum',
      legalName: 'OM.Network, LLC',
      domains: {
        primary: 'betayum.com',
        staging: 'staging.betayum.com',
        app: 'https://app.betayum.com',
        api: 'https://api.betayum.com',
        portal: 'https://portal.betayum.com',
        appStaging: 'https://app.staging.betayum.com',
        apiStaging: 'https://api.staging.betayum.com',
        portalStaging: 'https://portal.staging.betayum.com',
        marketing: 'https://betayum.com',
        docs: 'https://betayum.com/docs',
        cdn: 'https://cdn.betayum.com',
      },
      emails: {
        support: 'support@betayum.com',
        sales: 'sales@betayum.com',
        security: 'security@betayum.com',
        hello: 'hello@betayum.com',
      },
      assets: {
        logoUrl: 'https://cdn.betayum.com/logo.png',
        opengraphImageUrl: 'https://cdn.betayum.com/opengraph-image.jpg',
      },
      compatibilityIdentifiers: {
        awsAuditorRole: 'CompAI-Auditor',
        awsRemediatorRole: 'CompAI-Remediator',
        awsAutoFixPolicy: 'CompAI-AutoFix',
        windowsFleetPath: 'C:\\ProgramData\\CompAI\\Fleet',
        windowsFleetFallbackPath: 'C:\\Users\\Public\\CompAI\\Fleet',
        deviceAgentArtifactPrefix: 'CompAI-Device-Agent',
      },
    });
  });

  it('allows deployments to override URLs, emails, and assets', () => {
    const brand = getBrandConfig({
      BETAYUM_APP_URL: 'https://custom-app.example.com',
      BETAYUM_SUPPORT_EMAIL: 'help@example.com',
      BETAYUM_LOGO_URL: 'https://assets.example.com/logo.svg',
    });

    expect(brand.domains.app).toBe('https://custom-app.example.com');
    expect(brand.emails.support).toBe('help@example.com');
    expect(brand.assets.logoUrl).toBe('https://assets.example.com/logo.svg');
    expect(brand.displayName).toBe('Betayum');
    expect(brand.compatibilityIdentifiers.awsRemediatorRole).toBe('CompAI-Remediator');
  });
});
