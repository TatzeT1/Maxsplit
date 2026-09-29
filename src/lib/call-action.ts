import type { ActionResult } from "@/lib/actions/groups";

/**
 * Calls a Server Action and turns a thrown call — the request never reached
 * the server (offline, a dropped connection) or the server crashed — into an
 * ordinary `{ ok: false, error: "network" }`. Without it, `await addExpense()`
 * rejected, the handler's `setLoading(false)` never ran, and the dialog sat
 * on its spinner for good: a failed save that looked like a slow one.
 */
export async function callAction<T>(
  action: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, error: "network" };
  }
}
