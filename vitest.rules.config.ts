import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate config for Firestore/Storage security rules tests: these need the
// emulator running (via `firebase emulators:exec`) and a node environment,
// unlike the jsdom-based component/unit tests in vitest.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.rules.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
