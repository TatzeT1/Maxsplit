import { FieldValue } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { deleteExpense, restoreExpense } from "@/lib/actions/expenses";
import { deleteSettlement, recordSettlement, restoreSettlement } from "@/lib/actions/settlements";
import type { ActivityLogEntry, Settlement } from "@/lib/types";
import {
  placeholderMember,
  readGroup,
  realMember,
  seedExpense,
  seedGroup,
  seedSettlement,
} from "@/test/fixtures";
import { sentPushes } from "@/test/push-mock";
import { signInAs } from "@/test/session-mock";

// The "Rückgängig" toast after deleting an expense or a payment. Everything it
// can run into is a change to the group in the seconds between the deletion and
// the tap, plus who is allowed to tap.

async function seedMaxLeaBen() {
  const groupRef = await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
  });
  return groupRef;
}

async function activityTypes(groupRef: FirebaseFirestore.DocumentReference) {
  const snap = await groupRef.collection("activityLog").get();
  return snap.docs.map((doc) => (doc.data() as ActivityLogEntry).type).sort();
}

describe("restoreExpense", () => {
  it("brings a deleted expense back, into the balances and onto the activity log", async () => {
    const groupRef = await seedMaxLeaBen();
    const expenseId = await seedExpense(groupRef, "max", { max: 1000, lea: 2000 });
    signInAs({ uid: "max" });

    await deleteExpense({ groupId: "g1", expenseId });
    // Nothing booked: the cache only names people the ledger mentions.
    expect((await readGroup("g1")).balancesMinor).toEqual({});

    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({ ok: true, data: null });

    const expense = await groupRef.collection("expenses").doc(expenseId).get();
    expect(expense.data()?.deletedAt).toBeNull();
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: 2000, lea: -2000 });
    expect(await activityTypes(groupRef)).toEqual(["expense_deleted", "expense_restored"]);
  });

  it("lets a manager undo a member's deletion, but not a stranger to the expense", async () => {
    const groupRef = await seedMaxLeaBen();
    const expenseId = await seedExpense(groupRef, "lea", { lea: 1000, ben: 1000 });
    signInAs({ uid: "lea" });
    await deleteExpense({ groupId: "g1", expenseId });

    // Ben didn't enter it and isn't a manager: same rule as deleting.
    signInAs({ uid: "ben" });
    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({
      ok: false,
      error: "not-owner",
    });
    expect(
      (await groupRef.collection("expenses").doc(expenseId).get()).data()?.deletedAt,
    ).not.toBeNull();

    signInAs({ uid: "max" });
    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({ ok: true, data: null });
    expect(
      (await groupRef.collection("expenses").doc(expenseId).get()).data()?.deletedAt,
    ).toBeNull();
  });

  it("is a no-op for an expense that isn't deleted — a double tap books and logs nothing twice", async () => {
    const groupRef = await seedMaxLeaBen();
    const expenseId = await seedExpense(groupRef, "max", { max: 1000, lea: 1000 });
    signInAs({ uid: "max" });
    await deleteExpense({ groupId: "g1", expenseId });

    await restoreExpense({ groupId: "g1", expenseId });
    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({ ok: true, data: null });

    expect(await activityTypes(groupRef)).toEqual(["expense_deleted", "expense_restored"]);
  });

  it("refuses once the group's currency changed — deleting the last expense unlocks it", async () => {
    const groupRef = await seedMaxLeaBen();
    const expenseId = await seedExpense(groupRef, "max", { max: 1000, lea: 1000 });
    signInAs({ uid: "max" });
    await deleteExpense({ groupId: "g1", expenseId });
    await groupRef.update({ currency: "USD" });

    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({
      ok: false,
      error: "invalid-currency",
    });
    expect(
      (await groupRef.collection("expenses").doc(expenseId).get()).data()?.deletedAt,
    ).not.toBeNull();
  });

  it("refuses when someone in it has left — a debt to a former member would vanish from the balances", async () => {
    const groupRef = await seedMaxLeaBen();
    const expenseId = await seedExpense(groupRef, "max", { max: 1000, ben: 1000 });
    signInAs({ uid: "max" });
    await deleteExpense({ groupId: "g1", expenseId });
    await groupRef.update({ "members.ben": FieldValue.delete() });

    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({
      ok: false,
      error: "member-gone",
    });
  });

  it("still restores an expense involving a placeholder member", async () => {
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      oma: placeholderMember("Oma"),
    });
    const expenseId = await seedExpense(groupRef, "max", { max: 1000, oma: 1000 });
    signInAs({ uid: "max" });
    await deleteExpense({ groupId: "g1", expenseId });

    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({ ok: true, data: null });
  });

  it("answers not-found for an expense that doesn't exist and forbidden for an outsider", async () => {
    const groupRef = await seedMaxLeaBen();
    const expenseId = await seedExpense(groupRef, "max", { max: 1000, lea: 1000 });
    signInAs({ uid: "max" });
    expect(await restoreExpense({ groupId: "g1", expenseId: "nope" })).toEqual({
      ok: false,
      error: "not-found",
    });

    signInAs({ uid: "stranger" });
    expect(await restoreExpense({ groupId: "g1", expenseId })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("restoreSettlement", () => {
  /** What the client still has on screen after deleting: the settlement as it was. */
  async function deleteOne(createdByUid = "lea") {
    const groupRef = await seedMaxLeaBen();
    const settlementId = await seedSettlement(groupRef, "lea", "max", 1500);
    await groupRef.collection("settlements").doc(settlementId).update({ createdBy: createdByUid });
    signInAs({ uid: "lea" });
    const before = (
      await groupRef.collection("settlements").doc(settlementId).get()
    ).data() as Omit<Settlement, "id">;
    await deleteSettlement({ groupId: "g1", settlementId });
    const restore = {
      groupId: "g1",
      settlementId,
      fromUid: before.fromUid,
      toUid: before.toUid,
      amountMinor: before.amountMinor,
      currency: before.currency,
      date: before.date,
      note: before.note,
    };
    return { groupRef, settlementId, restore };
  }

  it("books the payment again under its old id, into the balances and onto the activity log", async () => {
    const { groupRef, settlementId, restore } = await deleteOne();
    expect((await groupRef.collection("settlements").get()).empty).toBe(true);

    expect(await restoreSettlement(restore)).toEqual({ ok: true, data: { settlementId } });

    const restored = await groupRef.collection("settlements").doc(settlementId).get();
    expect(restored.data()).toMatchObject({
      fromUid: "lea",
      toUid: "max",
      amountMinor: 1500,
      date: "2026-09-02",
    });
    // Lea paid Max 15 €, so Lea is up and Max is down.
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: -1500, lea: 1500 });
    expect(await activityTypes(groupRef)).toEqual(["settlement_deleted", "settlement_restored"]);
  });

  it("books it once however often it's tapped, and doesn't push the receiver a second time", async () => {
    const { groupRef, restore } = await deleteOne();

    await restoreSettlement(restore);
    expect(await restoreSettlement(restore)).toEqual({
      ok: true,
      data: { settlementId: restore.settlementId },
    });

    expect((await groupRef.collection("settlements").get()).size).toBe(1);
    expect(await activityTypes(groupRef)).toEqual(["settlement_deleted", "settlement_restored"]);
    expect(sentPushes).toEqual([]);
  });

  it("makes the restoring member its creator, whatever the request says", async () => {
    const { groupRef, settlementId, restore } = await deleteOne();

    await restoreSettlement({ ...restore, createdBy: "max" } as typeof restore);

    expect(
      (await groupRef.collection("settlements").doc(settlementId).get()).data()?.createdBy,
    ).toBe("lea");
  });

  it("holds the restored payment to the same checks as a new one", async () => {
    const { groupRef, restore } = await deleteOne();

    expect(await restoreSettlement({ ...restore, currency: "USD" })).toEqual({
      ok: false,
      error: "invalid-currency",
    });
    expect(await restoreSettlement({ ...restore, amountMinor: 0 })).toEqual({
      ok: false,
      error: "invalid-amount",
    });
    expect(await restoreSettlement({ ...restore, toUid: "lea" })).toEqual({
      ok: false,
      error: "invalid-parties",
    });
    expect(await restoreSettlement({ ...restore, toUid: "ghost" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await restoreSettlement({ ...restore, date: "29.09.2026" })).toEqual({
      ok: false,
      error: "invalid-date",
    });
    expect((await groupRef.collection("settlements").get()).empty).toBe(true);
  });

  it("rejects ids that aren't Firestore auto ids, so a request can't pick a path", async () => {
    const { groupRef, restore } = await deleteOne();

    for (const settlementId of ["", "a/b", "short", "x".repeat(21), "../../groups"]) {
      expect(await restoreSettlement({ ...restore, settlementId })).toEqual({
        ok: false,
        error: "not-found",
      });
    }
    expect((await groupRef.collection("settlements").get()).empty).toBe(true);
  });

  it("is for group members only", async () => {
    const { restore } = await deleteOne();

    signInAs({ uid: "stranger" });
    expect(await restoreSettlement(restore)).toEqual({ ok: false, error: "forbidden" });
  });

  it("doesn't touch a payment that was booked normally", async () => {
    await seedMaxLeaBen();
    signInAs({ uid: "lea" });
    const recorded = await recordSettlement({
      groupId: "g1",
      fromUid: "lea",
      toUid: "max",
      amountMinor: 700,
      currency: "EUR",
      date: "2026-09-03",
      note: "Bar",
    });
    if (!recorded.ok) throw new Error(recorded.error);

    // Restoring over a live payment must not overwrite it.
    expect(
      await restoreSettlement({
        groupId: "g1",
        settlementId: recorded.data.settlementId,
        fromUid: "lea",
        toUid: "max",
        amountMinor: 99900,
        currency: "EUR",
        date: "2026-01-01",
        note: "overwritten?",
      }),
    ).toEqual({ ok: true, data: { settlementId: recorded.data.settlementId } });
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: -700, lea: 700 });
  });
});
