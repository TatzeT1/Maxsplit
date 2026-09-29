// Stand-in for the `server-only` package in the emulator integration tests
// (see vitest.emulator.config.ts): the real package throws unless it's
// resolved under React's server condition, which a plain node test run isn't.
export {};
