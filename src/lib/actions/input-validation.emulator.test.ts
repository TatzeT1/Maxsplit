import { describe, expect, it } from "vitest";
import { addExpense, type ExpenseInput } from "@/lib/actions/expenses";
import { createGroup, updateGroup } from "@/lib/actions/groups";
import { createRecurringRule, type RecurringRuleInput } from "@/lib/actions/recurring";
import { recordSettlement, type SettlementInput } from "@/lib/actions/settlements";
import type { CategoryId, RecurringFrequency, SplitMode } from "@/lib/types";
import { readGroup, realMember, seedExpense, seedGroup, seedRecurringRule } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

// Each case here is a request the UI never sends but a hand-crafted one can:
// the Server Action's parameter types are compile-time only.

const expense: ExpenseInput = {
  groupId: "g1",
  description: "Pizza",
  amountMinor: 3000,
  currency: "EUR",
  date: "2026-09-29",
  category: "restaurant",
  emoji: null,
  paidBy: { max: 3000 },
  splitMode: "equal",
  participantUids: ["max", "lea"],
  splitInputs: {},
  viaLottery: false,
};

async function seedMaxAndLea() {
  const ref = await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
  });
  signInAs({ uid: "max" });
  return ref;
}

describe("addExpense rejects malformed input before it reaches the ledger", () => {
  it("accepts the well-formed baseline", async () => {
    await seedMaxAndLea();
    expect((await addExpense(expense)).ok).toBe(true);
  });

  it.each([
    [{ currency: "USD" }, "invalid-currency"],
    [{ currency: "EURO" }, "invalid-currency"],
    [{ date: "29.09.2026" }, "invalid-date"],
    [{ date: "2026-02-30" }, "invalid-date"],
    [{ category: "bogus" as unknown as CategoryId }, "invalid-category"],
    [{ emoji: "not an emoji, a paragraph" }, "invalid-emoji"],
    [{ description: "x".repeat(201) }, "invalid-description"],
    [{ splitMode: "random" as unknown as SplitMode }, "invalid-split"],
    [{ paidBy: { max: 1500.5, lea: 1499.5 } }, "invalid-split"],
    [{ paidBy: { max: 6000, lea: -3000 } }, "invalid-split"],
    [{ amountMinor: 0, paidBy: { max: 0 } }, "invalid-amount"],
    // A credit's receivers are negative payers; a positive one isn't receiving.
    [{ amountMinor: -3000, paidBy: { max: 3000 } }, "invalid-split"],
    [{ amountMinor: -3000, paidBy: { max: -4000, lea: 1000 } }, "invalid-split"],
    // Nobody plays a game for a share of a refund.
    [{ amountMinor: -3000, paidBy: { max: -3000 }, viaLottery: true }, "invalid-split"],
  ] as const)("rejects %o with %s", async (patch, error) => {
    const groupRef = await seedMaxAndLea();
    expect(await addExpense({ ...expense, ...patch })).toEqual({ ok: false, error });
    expect((await groupRef.collection("expenses").get()).empty).toBe(true);
  });
});

describe("addExpense with a credit (Gutschrift)", () => {
  it("books a deposit slip negative, shared like a bill", async () => {
    const groupRef = await seedMaxAndLea();
    const result = await addExpense({
      ...expense,
      description: "Pfandbon",
      amountMinor: -325,
      paidBy: { lea: -325 },
    });
    expect(result.ok).toBe(true);
    const [doc] = (await groupRef.collection("expenses").get()).docs;
    expect(doc.data().splits).toEqual({
      max: { rawValue: 1, amountMinor: -163 },
      lea: { rawValue: 1, amountMinor: -162 },
    });
    // Lea has the money, so she owes Max his half.
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: 163, lea: -163 });
  });

  it("books an exact credit split", async () => {
    await seedMaxAndLea();
    const result = await addExpense({
      ...expense,
      amountMinor: -500,
      paidBy: { max: -500 },
      splitMode: "exact",
      splitInputs: { max: -100, lea: -400 },
    });
    expect(result.ok).toBe(true);
  });
});

describe("addExpense with a split game's record", () => {
  // Lea pays the whole bill, as a game result applied in the form would have it.
  const gameExpense: ExpenseInput = {
    ...expense,
    splitMode: "exact",
    participantUids: [],
    splitInputs: { lea: 3000 },
    viaLottery: true,
    game: { gameId: "wheel", playerUids: ["max", "lea"], attempt: 2 },
  };

  it("stores which game decided it, who played and the attempt", async () => {
    const groupRef = await seedMaxAndLea();
    const result = await addExpense(gameExpense);
    expect(result.ok).toBe(true);
    const [doc] = (await groupRef.collection("expenses").get()).docs;
    expect(doc.data().game).toEqual({ gameId: "wheel", playerUids: ["max", "lea"], attempt: 2 });
  });

  it("tells the group chat who pays, reshuffle included", async () => {
    const groupRef = await seedMaxAndLea();
    expect((await addExpense(gameExpense)).ok).toBe(true);
    const messages = (await groupRef.collection("messages").get()).docs.map((doc) => doc.data());
    expect(messages).toHaveLength(1);
    expect(messages[0].senderUid).toBe("max");
    expect(messages[0].gameResult).toEqual({
      gameId: "wheel",
      loserUids: ["lea"],
      winnerUid: null,
      amount: { description: "Pizza", amountMinor: 3000, currency: "EUR" },
      attempt: 2,
      tournamentId: null,
    });
    expect(messages[0].text).toMatch(/^🎡 Lea zahlt „Pizza“ \(30,00\s€\) — im 2\. Versuch$/);
  });

  it("ignores the record on a split chosen by hand, and posts no game result", async () => {
    const groupRef = await seedMaxAndLea();
    expect((await addExpense({ ...gameExpense, viaLottery: false })).ok).toBe(true);
    const [doc] = (await groupRef.collection("expenses").get()).docs;
    expect(doc.data()).not.toHaveProperty("game");
    // Only the plain expense card — no result card, since no game decided it.
    const messages = (await groupRef.collection("messages").get()).docs.map((doc) => doc.data());
    expect(messages).toHaveLength(1);
    expect(messages[0]).not.toHaveProperty("gameResult");
    expect(messages[0]).toHaveProperty("expenseCard");
  });

  it.each([
    [{ gameId: "poker", playerUids: ["max", "lea"], attempt: 1 }],
    [{ gameId: "wheel", playerUids: ["max", "stranger"], attempt: 1 }],
    // Lea pays but isn't listed as a player.
    [{ gameId: "wheel", playerUids: ["max", "max"], attempt: 1 }],
    [{ gameId: "wheel", playerUids: ["max", "lea"], attempt: 0 }],
  ])("rejects a malformed record %o", async (game) => {
    const groupRef = await seedMaxAndLea();
    expect(
      await addExpense({ ...gameExpense, game: game as unknown as ExpenseInput["game"] }),
    ).toEqual({ ok: false, error: "invalid-game" });
    expect((await groupRef.collection("expenses").get()).empty).toBe(true);
  });
});

describe("recordSettlement", () => {
  const settlement: SettlementInput = {
    groupId: "g1",
    fromUid: "lea",
    toUid: "max",
    amountMinor: 1500,
    currency: "EUR",
    date: "2026-09-29",
    note: "",
  };

  it.each([
    [{ currency: "CHF" }, "invalid-currency"],
    [{ date: "gestern" }, "invalid-date"],
    [{ note: "x".repeat(201) }, "invalid-note"],
  ] as const)("rejects %o with %s", async (patch, error) => {
    await seedMaxAndLea();
    expect(await recordSettlement({ ...settlement, ...patch })).toEqual({ ok: false, error });
  });
});

describe("createRecurringRule", () => {
  const rule: RecurringRuleInput = {
    groupId: "g1",
    description: "Miete",
    amountMinor: 6000,
    currency: "EUR",
    category: "housing",
    payerUid: "max",
    participantUids: ["max", "lea"],
    frequency: "monthly",
    startDate: "2026-10-01",
  };

  it("accepts the well-formed baseline", async () => {
    await seedMaxAndLea();
    expect((await createRecurringRule(rule)).ok).toBe(true);
  });

  it.each([
    [{ frequency: "yearly" as unknown as RecurringFrequency }, "invalid-frequency"],
    [{ startDate: "0026-10-01" }, "invalid-date"],
    [{ currency: "GBP" }, "invalid-currency"],
    [{ description: " " }, "invalid-description"],
    [{ amountMinor: 0 }, "invalid-amount"],
  ] as const)("rejects %o with %s", async (patch, error) => {
    await seedMaxAndLea();
    expect(await createRecurringRule({ ...rule, ...patch })).toEqual({ ok: false, error });
  });

  it("accepts a recurring credit", async () => {
    await seedMaxAndLea();
    expect((await createRecurringRule({ ...rule, amountMinor: -2000 })).ok).toBe(true);
  });
});

describe("group currency", () => {
  it("createGroup refuses a currency the app can't display", async () => {
    signInAs({ uid: "max" });
    expect(await createGroup({ name: "Urlaub", currency: "EURO" })).toEqual({
      ok: false,
      error: "invalid-currency",
    });
  });

  it("can change while nothing is booked yet", async () => {
    await seedMaxAndLea();
    expect(await updateGroup({ groupId: "g1", name: "WG", currency: "CHF" })).toEqual({
      ok: true,
      data: null,
    });
    expect((await readGroup("g1")).currency).toBe("CHF");
  });

  it("is locked once an expense exists, so 100 € can't turn into 100 $", async () => {
    const groupRef = await seedMaxAndLea();
    await seedExpense(groupRef, "max", { max: 5000, lea: 5000 });

    expect(await updateGroup({ groupId: "g1", name: "WG", currency: "USD" })).toEqual({
      ok: false,
      error: "currency-locked",
    });
    expect((await readGroup("g1")).currency).toBe("EUR");
  });

  it("is locked by a recurring rule alone, which books in the currency it was made with", async () => {
    const groupRef = await seedMaxAndLea();
    await seedRecurringRule(groupRef, "max", ["max", "lea"]);

    expect((await updateGroup({ groupId: "g1", name: "WG", currency: "USD" })).ok).toBe(false);
  });

  it("isn't locked by an expense that was deleted", async () => {
    const groupRef = await seedMaxAndLea();
    await seedExpense(groupRef, "max", { max: 5000 }, { deletedAt: "2026-09-02T00:00:00.000Z" });

    expect((await updateGroup({ groupId: "g1", name: "WG", currency: "USD" })).ok).toBe(true);
  });

  it("still lets a locked group be renamed", async () => {
    const groupRef = await seedMaxAndLea();
    await seedExpense(groupRef, "max", { max: 5000, lea: 5000 });

    expect((await updateGroup({ groupId: "g1", name: "Neue WG", currency: "EUR" })).ok).toBe(true);
    expect((await readGroup("g1")).name).toBe("Neue WG");
  });
});
