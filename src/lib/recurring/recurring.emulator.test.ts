import { describe, expect, it } from "vitest";
import { joinGroupByInviteCode, leaveGroup, removeMember } from "@/lib/actions/groups";
import { deleteRecurringRule, setRecurringRuleActive } from "@/lib/actions/recurring";
import { materializeDueRecurringRules, recurringExpenseId } from "@/lib/recurring/materialize";
import { firstRunOnOrAfter, utcToday } from "@/lib/recurring/schedule";
import type { Expense, RecurringRule } from "@/lib/types";
import {
  placeholderMember,
  readGroup,
  realMember,
  seedExpense,
  seedGroup,
  seedRecurringRule,
} from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

async function expensesOf(groupRef: FirebaseFirestore.DocumentReference) {
  const snap = await groupRef.collection("expenses").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Expense, "id">) }));
}

async function ruleOf(ruleRef: FirebaseFirestore.DocumentReference) {
  return (await ruleRef.get()).data() as Omit<RecurringRule, "id">;
}

describe("claiming a placeholder", () => {
  it("rewrites recurring rules too, so the cron books on the real member", async () => {
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      ph_lea: placeholderMember("Lea"),
    });
    const ruleRef = await seedRecurringRule(groupRef, "max", ["max", "ph_lea"], {
      nextRunDate: "2026-10-01",
    });
    signInAs({ uid: "lea" });

    const joined = await joinGroupByInviteCode({
      inviteCode: "CODEG1",
      claimPlaceholderId: "ph_lea",
    });
    expect(joined.ok).toBe(true);

    const rule = await ruleOf(ruleRef);
    expect(Object.keys(rule.splits).sort()).toEqual(["lea", "max"]);

    await materializeDueRecurringRules("2026-10-01");
    const [booked] = await expensesOf(groupRef);
    expect(Object.keys(booked.splits).sort()).toEqual(["lea", "max"]);
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: 3000, lea: -3000 });
  });

  it("adds a rejoining member's old stake to the placeholder's instead of overwriting it", async () => {
    // Lea left once (settled up), and her old uid still sits in an expense
    // next to the placeholder someone created for her afterwards.
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      ph_lea: placeholderMember("Lea"),
    });
    await seedExpense(groupRef, "max", { max: 1000, lea: 1000, ph_lea: 1000 });
    signInAs({ uid: "lea" });

    await joinGroupByInviteCode({ inviteCode: "CODEG1", claimPlaceholderId: "ph_lea" });

    const [expense] = await expensesOf(groupRef);
    expect(expense.splits).toEqual({
      max: { rawValue: 1000, amountMinor: 1000 },
      lea: { rawValue: 2000, amountMinor: 2000 },
    });
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: 2000, lea: -2000 });
  });
});

describe("leaving or removing a member named in a recurring rule", () => {
  it("refuses to let a member leave while a rule names them, even a paused one", async () => {
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      lea: realMember("Lea"),
    });
    const ruleRef = await seedRecurringRule(groupRef, "max", ["max", "lea"], { active: false });
    signInAs({ uid: "lea" });

    expect(await leaveGroup({ groupId: "g1" })).toEqual({ ok: false, error: "in-recurring-rule" });
    expect((await readGroup("g1")).memberUids).toContain("lea");

    signInAs({ uid: "max" });
    await deleteRecurringRule({ groupId: "g1", ruleId: ruleRef.id });
    signInAs({ uid: "lea" });
    expect(await leaveGroup({ groupId: "g1" })).toEqual({ ok: true, data: null });
  });

  it("refuses to remove a placeholder that a rule still charges", async () => {
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      ph_tom: placeholderMember("Tom"),
    });
    await seedRecurringRule(groupRef, "max", ["max", "ph_tom"]);
    signInAs({ uid: "max" });

    expect(await removeMember({ groupId: "g1", uid: "ph_tom" })).toEqual({
      ok: false,
      error: "in-recurring-rule",
    });
  });

  it("still lets someone the rules don't mention leave", async () => {
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      lea: realMember("Lea"),
    });
    await seedRecurringRule(groupRef, "max", ["max"]);
    signInAs({ uid: "lea" });

    expect(await leaveGroup({ groupId: "g1" })).toEqual({ ok: true, data: null });
  });
});

describe("materializeDueRecurringRules", () => {
  it("books a due period and refreshes the balance cache the groups list reads", async () => {
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      lea: realMember("Lea"),
    });
    const ruleRef = await seedRecurringRule(groupRef, "max", ["max", "lea"], {
      nextRunDate: "2026-10-01",
    });

    expect(await materializeDueRecurringRules("2026-10-01")).toEqual({ created: 1, paused: 0 });

    const expenses = await expensesOf(groupRef);
    expect(expenses.map((expense) => expense.id)).toEqual([
      recurringExpenseId(ruleRef.id, "2026-10-01"),
    ]);
    expect((await ruleOf(ruleRef)).nextRunDate).toBe("2026-11-01");
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: 3000, lea: -3000 });
  });

  it("books each period once, however often the cron runs that day", async () => {
    const groupRef = await seedGroup("g1", { max: realMember("Max"), lea: realMember("Lea") });
    await seedRecurringRule(groupRef, "max", ["max", "lea"], { nextRunDate: "2026-10-01" });

    await materializeDueRecurringRules("2026-10-01");
    expect(await materializeDueRecurringRules("2026-10-01")).toEqual({ created: 0, paused: 0 });
    expect(await expensesOf(groupRef)).toHaveLength(1);
  });

  it("books each period once even when two runs overlap", async () => {
    const groupRef = await seedGroup("g1", { max: realMember("Max"), lea: realMember("Lea") });
    await seedRecurringRule(groupRef, "max", ["max", "lea"], { nextRunDate: "2026-07-01" });

    const results = await Promise.all([
      materializeDueRecurringRules("2026-10-01"),
      materializeDueRecurringRules("2026-10-01"),
    ]);

    expect(results[0].created + results[1].created).toBe(4);
    const dates = (await expensesOf(groupRef)).map((expense) => expense.date).sort();
    expect(dates).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("doesn't re-create a period whose booking already exists, e.g. soft-deleted", async () => {
    const groupRef = await seedGroup("g1", { max: realMember("Max"), lea: realMember("Lea") });
    const ruleRef = await seedRecurringRule(groupRef, "max", ["max", "lea"], {
      nextRunDate: "2026-10-01",
    });
    const id = recurringExpenseId(ruleRef.id, "2026-10-01");
    await groupRef.collection("expenses").doc(id).set({ deletedAt: "2026-10-01T09:00:00.000Z" });

    expect(await materializeDueRecurringRules("2026-10-01")).toEqual({ created: 0, paused: 0 });
    expect((await ruleOf(ruleRef)).nextRunDate).toBe("2026-11-01");
    const [expense] = await expensesOf(groupRef);
    expect(expense.deletedAt).toBe("2026-10-01T09:00:00.000Z");
  });

  it("pauses, instead of booking, a rule naming someone who is no longer a member", async () => {
    const groupRef = await seedGroup("g1", { max: realMember("Max", { role: "owner" }) });
    // A rule left behind by a claim or a departure from before rules were checked.
    const ruleRef = await seedRecurringRule(groupRef, "max", ["max", "ph_gone"], {
      nextRunDate: "2026-10-01",
    });

    expect(await materializeDueRecurringRules("2026-10-01")).toEqual({ created: 0, paused: 1 });
    expect(await expensesOf(groupRef)).toHaveLength(0);
    expect((await ruleOf(ruleRef)).active).toBe(false);

    signInAs({ uid: "max" });
    expect(
      await setRecurringRuleActive({ groupId: "g1", ruleId: ruleRef.id, active: true }),
    ).toEqual({ ok: false, error: "rule-member-missing" });
  });
});

describe("resuming a paused rule", () => {
  it("skips the periods that passed while it was paused instead of booking them", async () => {
    const today = utcToday();
    const groupRef = await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      lea: realMember("Lea"),
    });
    const ruleRef = await seedRecurringRule(groupRef, "max", ["max", "lea"], {
      active: false,
      startDate: "2025-01-15",
      nextRunDate: "2025-03-15",
    });
    signInAs({ uid: "max" });

    expect(
      await setRecurringRuleActive({ groupId: "g1", ruleId: ruleRef.id, active: true }),
    ).toEqual({ ok: true, data: null });

    const rule = await ruleOf(ruleRef);
    expect(rule.active).toBe(true);
    expect(rule.nextRunDate).toBe(firstRunOnOrAfter("2025-03-15", "2025-01-15", "monthly", today));
    expect(rule.nextRunDate >= today).toBe(true);

    await materializeDueRecurringRules(today);
    const booked = await expensesOf(groupRef);
    expect(booked.every((expense) => expense.date >= today)).toBe(true);
    expect(booked.length).toBeLessThanOrEqual(1);
  });

  it("pausing leaves the schedule alone", async () => {
    const groupRef = await seedGroup("g1", { max: realMember("Max", { role: "owner" }) });
    const ruleRef = await seedRecurringRule(groupRef, "max", ["max"], {
      nextRunDate: "2026-12-01",
    });
    signInAs({ uid: "max" });

    await setRecurringRuleActive({ groupId: "g1", ruleId: ruleRef.id, active: false });

    expect(await ruleOf(ruleRef)).toMatchObject({ active: false, nextRunDate: "2026-12-01" });
  });
});
