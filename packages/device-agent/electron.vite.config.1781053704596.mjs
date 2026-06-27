// electron.vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { createRequire } from "node:module";
import { resolve } from "node:path";
var __electron_vite_injected_dirname = "/home/ryan/Documents/repos/betayum-develop/packages/device-agent";
var __electron_vite_injected_import_meta_url = "file:///home/ryan/Documents/repos/betayum-develop/packages/device-agent/electron.vite.config.ts";
var require2 = createRequire(__electron_vite_injected_import_meta_url);
var pkg = require2("./package.json");
var { resolveBuildEnv } = require2("./build-env.js");
var buildEnv = resolveBuildEnv();
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["electron-store"] })],
    define: {
      __PORTAL_URL__: JSON.stringify(
        buildEnv.portalUrl
      ),
      __API_URL__: JSON.stringify(
        buildEnv.apiUrl
      ),
      __AGENT_VERSION__: JSON.stringify(
        buildEnv.agentVersion || pkg.version
      ),
      __AUTO_UPDATE_URL__: JSON.stringify(
        buildEnv.autoUpdateUrl
      )
    },
    build: {
      outDir: "dist/main",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main/index.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts")
        }
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    build: {
      outDir: resolve(__electron_vite_injected_dirname, "dist/renderer"),
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
