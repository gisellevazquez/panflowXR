import { defineConfig } from "vitest/config";

// Standalone config so the dev-only Vite plugins (mkcert, uikitml, IWER)
// are not loaded during unit tests. Tests target the pure, deterministic
// recording/playback logic — no browser, audio, or XR runtime required.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
