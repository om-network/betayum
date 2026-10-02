import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/env.mjs', () => ({ env: {} }));
vi.mock('@/utils/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}));
vi.mock('@dub/analytics/react', () => ({ Analytics: () => null }));
vi.mock('@vercel/analytics/next', () => ({
  Analytics: () => <script defer src="/_vercel/insights/script.js" />,
}));
vi.mock('geist/font/mono', () => ({ GeistMono: { variable: 'geist-mono' } }));
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'general-sans' }) }));
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock('nuqs/adapters/next/app', () => ({
  NuqsAdapter: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('sonner', () => ({ Toaster: () => null }));
vi.mock('./providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => children,
}));

const { default: Layout } = await import('./layout');

describe('root layout analytics', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('does not request Vercel Analytics on a self-hosted deployment', async () => {
    vi.stubEnv('VERCEL', undefined);

    const markup = renderToStaticMarkup(await Layout({ children: null }));

    expect(markup).not.toContain('/_vercel/insights/script.js');
  });

  it('includes Vercel Analytics on Vercel', async () => {
    vi.stubEnv('VERCEL', '1');

    const markup = renderToStaticMarkup(await Layout({ children: null }));

    expect(markup).toContain('/_vercel/insights/script.js');
  });
});
