import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/shopping", () => ({ setShoppingItemChecked: vi.fn() }));

import {
  afterSend,
  effectiveChecked,
  pendingCheckKey,
  prunePendingChecks,
  unsentCount,
  withCheck,
  type PendingCheck,
} from "./pending-checks";

const tap = (patch: Partial<PendingCheck> = {}): PendingCheck => ({
  groupId: "g1",
  listId: "l1",
  itemId: "i1",
  checked: true,
  changedAt: "2026-10-22T10:00:00.000Z",
  ...patch,
});

const KEY = pendingCheckKey("g1", "l1", "i1");

describe("pending shopping ticks", () => {
  it("a newer tap on the same item replaces the older one and is unsent again", () => {
    let checks = withCheck({}, tap());
    checks = afterSend(checks, tap(), "sent", 1000);
    expect(checks[KEY].sentAt).toBe(1000);
    checks = withCheck(checks, tap({ checked: false, changedAt: "2026-10-22T10:00:05.000Z" }));
    expect(checks[KEY]).toMatchObject({ checked: false, sentAt: undefined });
    expect(unsentCount(checks, "g1", "l1")).toBe(1);
  });

  it("an answer for an older tap leaves a newer one alone", () => {
    const newer = tap({ checked: false, changedAt: "2026-10-22T10:00:05.000Z" });
    const checks = withCheck({}, newer);
    expect(afterSend(checks, tap(), "drop", 1000)).toBe(checks);
    expect(afterSend(checks, newer, "drop", 1000)).toEqual({});
  });

  it("shows the device's own tap over what the listener says", () => {
    const checks = withCheck({}, tap({ checked: true }));
    expect(effectiveChecked({ id: "i1", checked: false }, "g1", "l1", checks)).toBe(true);
    expect(effectiveChecked({ id: "i2", checked: false }, "g1", "l1", checks)).toBe(false);
  });

  it("keeps a sent tick until the listener agrees, then drops it", () => {
    const sent = afterSend(withCheck({}, tap()), tap(), "sent", 1000);
    expect(prunePendingChecks(sent, "g1", "l1", [{ id: "i1", checked: false }], true, 2000)).toBe(
      sent,
    );
    expect(prunePendingChecks(sent, "g1", "l1", [{ id: "i1", checked: true }], true, 2000)).toEqual(
      {},
    );
  });

  it("never drops an unsent tick, even when the item looks done already", () => {
    const unsent = withCheck({}, tap());
    expect(
      prunePendingChecks(unsent, "g1", "l1", [{ id: "i1", checked: true }], true, 10 ** 9),
    ).toBe(unsent);
  });

  it("drops a sent tick whose item is gone only by the server's word, not the cache's", () => {
    const sent = afterSend(withCheck({}, tap()), tap(), "sent", 1000);
    expect(prunePendingChecks(sent, "g1", "l1", [], false, 2000)).toBe(sent);
    expect(prunePendingChecks(sent, "g1", "l1", [], true, 2000)).toEqual({});
  });

  it("forgets a sent tick nobody confirmed after a while", () => {
    const sent = afterSend(withCheck({}, tap()), tap(), "sent", 1000);
    expect(prunePendingChecks(sent, "", "", null, false, 1000 + 3 * 60_000)).toEqual({});
  });
});
