"use client";

import { useSyncExternalStore } from "react";
import { setShoppingItemChecked } from "@/lib/actions/shopping";
import { callAction } from "@/lib/call-action";
import type { ShoppingItem } from "@/lib/types";

// Ticks on a shopping list that this device hasn't got to the server yet —
// the one exception to "offline is view-only" (ADR-009, docs/DECISIONS.md).
// In a shop without reception a tap must still count: it lands here first,
// shows at once, and is sent by `flushPendingChecks` (ShoppingCheckSync, on
// every screen) as soon as the device is online. Each entry says the end
// state and when the tap happened, so sending it twice, or late, is safe:
// the server keeps whichever tap is newer.
//
// In localStorage, per user, so a tap survives the app being closed in the
// shop; wiped on sign-out with the rest of the offline copy.

const PREFIX = "split:shopping-checks:";
/** A sent tick the listener never confirmed (the list isn't open) is forgotten after this. */
const SENT_TTL_MS = 2 * 60_000;

export interface PendingCheck {
  groupId: string;
  listId: string;
  itemId: string;
  checked: boolean;
  /** When the tap happened (ISO), the time the server compares. */
  changedAt: string;
  /** Reached the server; kept until the listener shows it, so the tick doesn't flicker back. */
  sentAt?: number;
}

export type PendingChecks = Record<string, PendingCheck>;

export const pendingCheckKey = (groupId: string, listId: string, itemId: string) =>
  `${groupId}/${listId}/${itemId}`;

// ---- pure helpers (unit-tested) ----

/** The map with this tap recorded — a newer tap on the same item replaces an older one. */
export function withCheck(checks: PendingChecks, check: PendingCheck): PendingChecks {
  const key = pendingCheckKey(check.groupId, check.listId, check.itemId);
  return { ...checks, [key]: { ...check, sentAt: undefined } };
}

/** What the server said about `check`: kept as sent, or dropped — unless a newer tap replaced it meanwhile. */
export function afterSend(
  checks: PendingChecks,
  check: PendingCheck,
  outcome: "sent" | "drop",
  now: number,
): PendingChecks {
  const key = pendingCheckKey(check.groupId, check.listId, check.itemId);
  const current = checks[key];
  if (!current || current.changedAt !== check.changedAt) return checks;
  const next = { ...checks };
  if (outcome === "drop") delete next[key];
  else next[key] = { ...current, sentAt: now };
  return next;
}

/**
 * Drops the sent ticks of one list that the listener has caught up with (the
 * item shows the wanted state, or is gone from a server snapshot), and any
 * sent tick older than SENT_TTL_MS.
 */
export function prunePendingChecks(
  checks: PendingChecks,
  groupId: string,
  listId: string,
  items: readonly Pick<ShoppingItem, "id" | "checked">[] | null,
  fromServer: boolean,
  now: number,
): PendingChecks {
  const byId = items ? new Map(items.map((item) => [item.id, item])) : null;
  let changed = false;
  const next: PendingChecks = {};
  for (const [key, check] of Object.entries(checks)) {
    let drop = false;
    if (check.sentAt !== undefined) {
      if (now - check.sentAt > SENT_TTL_MS) drop = true;
      else if (byId && check.groupId === groupId && check.listId === listId) {
        const item = byId.get(check.itemId);
        drop = item ? item.checked === check.checked : fromServer;
      }
    }
    if (drop) changed = true;
    else next[key] = check;
  }
  return changed ? next : checks;
}

/** The item's checked state with this device's own unsent or unconfirmed tap applied. */
export function effectiveChecked(
  item: Pick<ShoppingItem, "id" | "checked">,
  groupId: string,
  listId: string,
  checks: PendingChecks,
): boolean {
  return checks[pendingCheckKey(groupId, listId, item.id)]?.checked ?? item.checked;
}

/** Ticks of this list not yet sent — what "noch nicht gesendet" counts. */
export function unsentCount(checks: PendingChecks, groupId: string, listId: string): number {
  return Object.values(checks).filter(
    (check) => check.groupId === groupId && check.listId === listId && check.sentAt === undefined,
  ).length;
}

// ---- the store ----

const EMPTY: PendingChecks = {};
const cache = new Map<string, PendingChecks>();
const listeners = new Set<() => void>();

function read(uid: string): PendingChecks {
  const cached = cache.get(uid);
  if (cached) return cached;
  let checks = EMPTY;
  try {
    const raw = localStorage.getItem(PREFIX + uid);
    if (raw) checks = JSON.parse(raw) as PendingChecks;
  } catch {
    // Storage blocked or garbled: nothing pending — taps then live for this visit only.
  }
  cache.set(uid, checks);
  return checks;
}

function write(uid: string, update: (checks: PendingChecks) => PendingChecks) {
  const previous = read(uid);
  const next = update(previous);
  if (next === previous) return;
  cache.set(uid, next);
  try {
    if (Object.keys(next).length === 0) localStorage.removeItem(PREFIX + uid);
    else localStorage.setItem(PREFIX + uid, JSON.stringify(next));
  } catch {
    // See read().
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // Another tab of the app ticked something.
    if (event.key?.startsWith(PREFIX)) {
      cache.clear();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** This user's pending ticks, kept current. */
export function usePendingChecks(uid: string | null): PendingChecks {
  return useSyncExternalStore(
    subscribe,
    () => (uid ? read(uid) : EMPTY),
    () => EMPTY,
  );
}

/** Records a tap and, when online, sends it right away. */
export function queueCheck(uid: string, check: Omit<PendingCheck, "sentAt">): void {
  write(uid, (checks) => withCheck(checks, check));
  void flushPendingChecks(uid);
}

export function prunePendingChecksFor(
  uid: string,
  groupId: string,
  listId: string,
  items: readonly Pick<ShoppingItem, "id" | "checked">[] | null,
  fromServer: boolean,
): void {
  write(uid, (checks) =>
    prunePendingChecks(checks, groupId, listId, items, fromServer, Date.now()),
  );
}

/** Forgets every pending tick on this device — on sign-out. */
export function clearPendingChecks(): void {
  cache.clear();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // See read().
  }
  listeners.forEach((listener) => listener());
}

const flushing = new Set<string>();

/**
 * Sends this user's unsent ticks, one after the other. Stops at the first
 * call that doesn't reach the server (still offline — the next `online`
 * event tries again); a tick the server refuses for good (item or list
 * deleted, no longer a member) is dropped, since sending it again can't help.
 */
export async function flushPendingChecks(uid: string): Promise<void> {
  if (flushing.has(uid) || !navigator.onLine) return;
  flushing.add(uid);
  try {
    for (;;) {
      const next = Object.values(read(uid)).find((check) => check.sentAt === undefined);
      if (!next) break;
      const result = await callAction(() =>
        setShoppingItemChecked({
          groupId: next.groupId,
          listId: next.listId,
          itemId: next.itemId,
          checked: next.checked,
          changedAt: next.changedAt,
        }),
      );
      if (!result.ok && (result.error === "network" || result.error === "unauthenticated")) break;
      // Not applied: the server already holds a newer tap, which the listener will show.
      const outcome = result.ok && result.data.applied ? "sent" : "drop";
      write(uid, (checks) => afterSend(checks, next, outcome, Date.now()));
    }
  } finally {
    flushing.delete(uid);
  }
  // A sent tick on a list nobody has open is never confirmed by a listener.
  prunePendingChecksFor(uid, "", "", null, false);
}
