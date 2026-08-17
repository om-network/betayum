import uiConfig from '@trycompai/ui/tailwind.config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from 'tailwindcss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Portal uses the same Tailwind theme as @trycompai/ui so that UI components
 * (Dialog, Button, etc.) get correct utilities and design tokens.
 * Content paths are resolved from this config file so they work regardless
 * of cwd (e.g. when build runs from monorepo root).
 */
export default {
  ...uiConfig,
  theme: {
    ...uiConfig.theme,
    extend: {
      ...uiConfig.theme?.extend,
      colors: {
        ...uiConfig.theme?.extend?.colors,
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
    },
  },
  content: [
    path.join(__dirname, 'src', '**', '*.{ts,tsx}'),
    path.join(__dirname, '..', '..', 'packages', 'ui', 'src', '**', '*.{ts,tsx}'),
    path.join(__dirname, 'node_modules', '@trycompai', 'ui', 'src', '**', '*.{ts,tsx}'),
  ],
} satisfies Config;
