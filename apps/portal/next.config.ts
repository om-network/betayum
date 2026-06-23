import { withSentryConfig } from '@sentry/nextjs';
import path from 'path';
import './src/env.mjs';

const isStandalone = process.env.NEXT_OUTPUT_STANDALONE === 'true';

function getAllowedDevOrigins() {
  const urls = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];

  return Array.from(
    new Set(
      urls.flatMap((value) => {
        if (!value) {
          return [];
        }

        try {
          return [new URL(value).hostname];
        } catch {
          return [];
        }
      }),
    ),
  );
}

const config = {
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === 'true',
  },
  allowedDevOrigins: getAllowedDevOrigins(),
  transpilePackages: [
    '@trycompai/auth',
    '@trycompai/db',
    '@trycompai/design-system',
    '@carbon/icons-react',
    '@trycompai/company',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'header',
            key: 'Next-Action',
          },
        ],
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  ...(isStandalone
    ? {
        output: 'standalone' as const,
      }
    : {}),
};

export default withSentryConfig(config, {
  org: 'comp-ai',
  project: 'comp',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  tunnelRoute: '/monitoring',

  webpack: {
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
