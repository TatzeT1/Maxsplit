export const TIMEOUT = Symbol("timeout");

/**
 * Races `promise` against a clock. With Next's `experimental.useOffline`
 * flag on, a Server Action never rejects for a plain connectivity failure —
 * the framework holds it pending until the network returns (see
 * node_modules/next/dist/docs/01-app/02-guides/offline-support.md) — so code
 * that needs to know *now* whether a write is taking too long can't rely on
 * rejection to mean "offline" anymore. `promise` itself keeps running after
 * the timeout wins; this only stops waiting on it, it doesn't cancel it.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | typeof TIMEOUT> {
  return Promise.race([
    promise,
    new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), timeoutMs)),
  ]);
}
