import { iwsdkDev } from "@iwsdk/vite-plugin-dev";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";

// Run `npm run dev:quest` for a clean server (no IWER injection) that you can
// open on the Quest browser directly for real immersive-AR testing.
export default defineConfig(({ mode }) => {
  const isQuest = mode === "quest";
  // IWER emulator only for local desktop dev — never in production or on headset
  const useEmulator = mode === "development" && !isQuest;

  return {
  plugins: [
    mkcert(),
    ...(useEmulator ? [iwsdkDev({
      emulator: {
        device: "metaQuest3",
        environment: "living_room",
      },
      ai: { tools: ["claude"] },
      verbose: true,
    })] : []),

    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
  ],
  server: {
    host: "0.0.0.0",
    port: isQuest ? 8082 : 8081,
    open: !isQuest,
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
  base: "./",
  };
});
