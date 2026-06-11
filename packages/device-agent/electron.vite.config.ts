import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const { resolveBuildEnv } = require('./build-env.js');
const buildEnv = resolveBuildEnv();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
    define: {
      __PORTAL_URL__: JSON.stringify(
        buildEnv.portalUrl,
      ),
      __API_URL__: JSON.stringify(
        buildEnv.apiUrl,
      ),
      __AGENT_VERSION__: JSON.stringify(
        buildEnv.agentVersion || pkg.version,
      ),
      __AUTO_UPDATE_URL__: JSON.stringify(
        buildEnv.autoUpdateUrl,
      ),
    },
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
