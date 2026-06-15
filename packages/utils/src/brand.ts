export type BrandEnv = Record<string, string | undefined>;

export type BrandConfig = {
  displayName: string;
  legalName: string;
  domains: {
    primary: string;
    staging: string;
    app: string;
    api: string;
    portal: string;
    appStaging: string;
    apiStaging: string;
    portalStaging: string;
    marketing: string;
    docs: string;
    cdn: string;
  };
  emails: {
    support: string;
    sales: string;
    security: string;
    hello: string;
  };
  assets: {
    logoUrl: string;
    opengraphImageUrl: string;
  };
  compatibilityIdentifiers: {
    awsAuditorRole: string;
    awsRemediatorRole: string;
    awsAutoFixPolicy: string;
    windowsFleetPath: string;
    windowsFleetFallbackPath: string;
    deviceAgentArtifactPrefix: string;
  };
};

function envValue(env: BrandEnv, key: string, fallback: string) {
  const value = env[key];
  if (!value) return fallback;
  return value;
}

export function getBrandConfig(env: BrandEnv = process.env): BrandConfig {
  const primaryDomain = envValue(env, 'BETAYUM_PRIMARY_DOMAIN', 'betayum.com');
  const stagingDomain = envValue(env, 'BETAYUM_STAGING_DOMAIN', 'staging.betayum.com');
  const marketingUrl = envValue(env, 'BETAYUM_MARKETING_URL', `https://${primaryDomain}`);
  const cdnUrl = envValue(env, 'BETAYUM_CDN_URL', `https://cdn.${primaryDomain}`);

  return {
    displayName: 'Betayum',
    legalName: 'OM.Network, LLC',
    domains: {
      primary: primaryDomain,
      staging: stagingDomain,
      app: envValue(env, 'BETAYUM_APP_URL', `https://app.${primaryDomain}`),
      api: envValue(env, 'BETAYUM_API_URL', `https://api.${primaryDomain}`),
      portal: envValue(env, 'BETAYUM_PORTAL_URL', `https://portal.${primaryDomain}`),
      appStaging: envValue(env, 'BETAYUM_STAGING_APP_URL', `https://app.${stagingDomain}`),
      apiStaging: envValue(env, 'BETAYUM_STAGING_API_URL', `https://api.${stagingDomain}`),
      portalStaging: envValue(env, 'BETAYUM_STAGING_PORTAL_URL', `https://portal.${stagingDomain}`),
      marketing: marketingUrl,
      docs: envValue(env, 'BETAYUM_DOCS_URL', `${marketingUrl}/docs`),
      cdn: cdnUrl,
    },
    emails: {
      support: envValue(env, 'BETAYUM_SUPPORT_EMAIL', `support@${primaryDomain}`),
      sales: envValue(env, 'BETAYUM_SALES_EMAIL', `sales@${primaryDomain}`),
      security: envValue(env, 'BETAYUM_SECURITY_EMAIL', `security@${primaryDomain}`),
      hello: envValue(env, 'BETAYUM_HELLO_EMAIL', `hello@${primaryDomain}`),
    },
    assets: {
      logoUrl: envValue(env, 'BETAYUM_LOGO_URL', `${cdnUrl}/logo.png`),
      opengraphImageUrl: envValue(
        env,
        'BETAYUM_OPENGRAPH_IMAGE_URL',
        `${cdnUrl}/opengraph-image.jpg`,
      ),
    },
    compatibilityIdentifiers: {
      awsAuditorRole: 'CompAI-Auditor',
      awsRemediatorRole: 'CompAI-Remediator',
      awsAutoFixPolicy: 'CompAI-AutoFix',
      windowsFleetPath: 'C:\\ProgramData\\CompAI\\Fleet',
      windowsFleetFallbackPath: 'C:\\Users\\Public\\CompAI\\Fleet',
      deviceAgentArtifactPrefix: 'CompAI-Device-Agent',
    },
  };
}

export const brandConfig = getBrandConfig();
