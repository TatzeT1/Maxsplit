import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests for Server Actions and the recurring-expense cron,
// running the real code against the Firestore emulator (started by
// `firebase emulators:exec`, see the test:emulator script). Unlike the pure
// unit tests in vitest.config.ts, these exercise the queries, batches and
// transactions themselves. `server-only` is aliased to an empty module
// because there's no React Server bundler condition in a plain node run;
// getSession is mocked in vitest.emulator.setup.ts.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.emulator.test.ts"],
    setupFiles: ["./vitest.emulator.setup.ts"],
    // Every file shares one emulator database and clears it between tests.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
