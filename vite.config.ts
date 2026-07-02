import { iwsdkDev } from "@iwsdk/vite-plugin-dev";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import mkcert from "vite-plugin-mkcert";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const panflowDataDir = path.resolve(rootDir, "../panflow-data");

/** Serve ../panflow-data at /panflow-data during local dev. */
function panflowDataPlugin(): Plugin {
  return {
    name: "panflow-data-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/panflow-data/")) return next();

        const relativePath = decodeURIComponent(url.slice("/panflow-data/".length));
        const filePath = path.normalize(path.join(panflowDataDir, relativePath));
        if (!filePath.startsWith(panflowDataDir)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return next();
        }

        if (filePath.endsWith(".json")) {
          res.setHeader("Content-Type", "application/json");
        } else if (filePath.endsWith(".glb")) {
          res.setHeader("Content-Type", "model/gltf-binary");
        } else if (filePath.endsWith(".mp3")) {
          res.setHeader("Content-Type", "audio/mpeg");
        }

        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

// Run `npm run dev:quest` for a clean server (no IWER injection) that you can
// open on the Quest browser directly for real immersive-AR testing.
export default defineConfig(({ mode }) => {
  const isQuest = mode === "quest";
  // IWER emulator only for local desktop dev — never in production or on headset
  const useEmulator = mode === "development" && !isQuest;

  return {
  plugins: [
    mkcert(),
    panflowDataPlugin(),
    ...(useEmulator ? [iwsdkDev({
      emulator: {
        device: "metaQuest3",
        environment: "living_room",
      },
      ai: { tools: ["cursor"] },
      verbose: true,
    })] : []),

    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
  ],
  server: {
    host: "0.0.0.0",
    port: isQuest ? 8082 : 8081,
    open: !isQuest,
    fs: {
      allow: [rootDir, panflowDataDir],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: process.env.NODE_ENV !== "production",
    target: "esnext",
    rollupOptions: { input: "./index.html" },
  },
  esbuild: { target: "esnext" },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
    esbuildOptions: { target: "esnext" },
  },
  publicDir: "public",
  base: process.env.GITHUB_ACTIONS ? "/panflowXR/" : "./",
  };
});
