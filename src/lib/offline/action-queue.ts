"use client";

import { addExpense, type ExpenseInput } from "@/lib/actions/expenses";
import type { ActionResult } from "@/lib/actions/groups";
import { recordSettlement, type SettlementInput } from "@/lib/actions/settlements";
import { deleteRecord, getAllRecords, putRecord } from "@/lib/offline/db";
import { TIMEOUT, withTimeout } from "@/lib/offline/with-timeout";

export type QueuedActionKind = "add-expense" | "add-settlement";
type QueuedPayload = (ExpenseInput | SettlementInput) & { clientMutationId: string };

export interface QueuedAction {
  /** Equals `payload.clientMutationId` — see idempotent-create.ts for why. */
  id: string;
  kind: QueuedActionKind;
  payload: QueuedPayload;
  createdAt: number;
  /**
   * Set once the server rejected the action outright (a real validation
   * error, not a network failure), or once it's been stuck long enough that
   * "still offline" stops being the likely explanation. Either way, retrying
   * silently forever would be wrong — this is surfaced to the user instead.
   */
  error?: string;
}

// Only creation goes through here, deliberately. Queuing an edit or delete
// would mean replaying it against a server-assigned id that, if the original
// creation is itself still unsynced, doesn't exist yet — an ordering hazard
// a create-only queue never runs into. Editing/deleting while offline keeps
// today's fail-fast behaviour.

function callAction(
  action: Pick<QueuedAction, "kind" | "payload">,
): Promise<ActionResult<unknown>> {
  return action.kind === "add-expense"
    ? addExpense(action.payload as ExpenseInput)
    : recordSettlement(action.payload as SettlementInput);
}

/**
 * Deletes the outbox entry once the call actually resolves, whenever that
 * happens — independent of whatever's still waiting on `call` itself. A
 * caller can stop waiting on `call` (a UI timeout, a flush loop moving on)
 * without leaving the outbox out of sync with what the server ends up doing.
 */
function settleOnResolve(action: QueuedAction, call: Promise<ActionResult<unknown>>): void {
  void call
    .then((result) =>
      result.ok ? deleteRecord(action.id) : putRecord({ ...action, error: result.error }),
    )
    .catch(() => {
      // Left in the outbox; the next flush (or this same in-flight call, via
      // Next's own offline retry) will resolve it eventually.
    });
}

// How long a caller waits on a create call before treating it as "still
// going, deal with it later" — used both for the initial submit and for a
// background flush retry. With `experimental.useOffline` on, the underlying
// Server Action call doesn't reject for a plain connectivity failure — Next
// holds it pending until the network returns — so a fixed clock, not a
// caught rejection, is what signals "this one's offline for now."
const SETTLE_TIMEOUT_MS = 4000;

/**
 * Writes the action to the outbox first — so it survives the tab closing
 * before the call below settles — then attempts it immediately. Returns
 * either the server's response or `TIMEOUT` if it's still pending after
 * `SETTLE_TIMEOUT_MS`; the caller (a dialog's submit handler) decides what
 * "still going" looks like in its own UI. The outbox entry is cleaned up
 * automatically whenever the call actually resolves, on whatever timeline
 * that turns out to be — a later flush isn't needed for the common case
 * where it resolves in the background a few seconds after the UI stopped
 * waiting.
 */
export async function submitCreateAction(
  kind: QueuedActionKind,
  payload: QueuedPayload,
): Promise<ActionResult<unknown> | typeof TIMEOUT> {
  const action: QueuedAction = {
    id: payload.clientMutationId,
    kind,
    payload,
    createdAt: Date.now(),
  };
  await putRecord(action);
  const call = callAction(action);
  settleOnResolve(action, call);
  return withTimeout(call, SETTLE_TIMEOUT_MS);
}

export function listQueuedActions(): Promise<QueuedAction[]> {
  return getAllRecords<QueuedAction>();
}

export function discardQueuedAction(id: string): Promise<void> {
  return deleteRecord(id);
}

/** Clears a prior error so the next flush gives the action another try. */
export async function retryQueuedAction(action: QueuedAction): Promise<void> {
  await putRecord({ ...action, error: undefined });
}

// After this long, "still offline" stops being the likely explanation for a
// repeatedly-failing replay — surface it instead of retrying forever. Long
// enough that a genuinely offline weekend (or a flight) doesn't trip it.
const GIVE_UP_AFTER_MS = 48 * 60 * 60 * 1000;

async function replay(action: QueuedAction): Promise<"synced" | "failed" | "still-offline"> {
  const call = callAction(action);
  settleOnResolve(action, call);

  const outcome = await withTimeout(call, SETTLE_TIMEOUT_MS);
  if (outcome === TIMEOUT) {
    if (Date.now() - action.createdAt > GIVE_UP_AFTER_MS) {
      await putRecord({ ...action, error: "sync-timeout" });
      return "failed";
    }
    return "still-offline";
  }
  return outcome.ok ? "synced" : "failed";
}

let flushing = false;

/**
 * Replays queued actions oldest-first. Stops at the first one that's still
 * pending after `SETTLE_TIMEOUT_MS` rather than looping through the rest —
 * if the device is genuinely offline, every other queued action would be
 * waiting on the same dead connection, so there's nothing to gain from
 * burning through them one at a time.
 */
export async function flushQueuedActions(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const actions = (await listQueuedActions())
      .filter((action) => !action.error)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const action of actions) {
      const outcome = await replay(action);
      if (outcome === "still-offline") break;
    }
  } finally {
    flushing = false;
  }
}
