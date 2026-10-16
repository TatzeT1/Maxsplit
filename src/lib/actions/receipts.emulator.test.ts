import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addExpense, editExpense, type ExpenseInput } from "@/lib/actions/expenses";
import { scanReceipt } from "@/lib/actions/receipts";
import { adminDb } from "@/lib/firebase/admin";
import { RECEIPT_SCANS_PER_DAY } from "@/lib/receipt/receipt";
import type { ExpenseReceipt } from "@/lib/types";
import { placeholderMember, readGroup, realMember, seedGroup } from "@/test/fixtures";
import { signInAs, signOut } from "@/test/session-mock";

// 📷 Beleg: reading a receipt photo (scanReceipt) and booking the split
// assigned from its items (addExpense / editExpense with `receipt`).

async function seedDinnerTable() {
  return seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    oma: placeholderMember("Oma"),
  });
}

// 3 Cola (3,50 each), 4 Spätzle (8,50 each), the last one shared by Lea and Oma.
const receipt: ExpenseReceipt = {
  items: [
    {
      name: "Cola",
      quantity: 3,
      totalMinor: 1050,
      units: [{ uids: ["max"] }, { uids: ["lea"] }, { uids: ["oma"] }],
    },
    {
      name: "Käsespätzle",
      quantity: 4,
      totalMinor: 3400,
      units: [{ uids: ["max"] }, { uids: ["max"] }, { uids: ["lea"] }, { uids: ["lea", "oma"] }],
    },
  ],
};

// 44,50 of items, paid 44,50: Max 3,50 + 17,00; Lea 3,50 + 8,50 + 4,25; Oma 3,50 + 4,25.
const receiptExpense: ExpenseInput = {
  groupId: "g1",
  description: "Gasthaus Krone",
  amountMinor: 4450,
  currency: "EUR",
  date: "2026-10-15",
  category: "restaurant",
  emoji: null,
  paidBy: { max: 4450 },
  splitMode: "exact",
  participantUids: [],
  splitInputs: { max: 2050, lea: 1625, oma: 775 },
  viaLottery: false,
  receipt,
};

describe("addExpense with a receipt", () => {
  it("books the split the items allocate and stores the items with it", async () => {
    const groupRef = await seedDinnerTable();
    signInAs({ uid: "max" });

    const result = await addExpense(receiptExpense);
    expect(result.ok).toBe(true);

    const [doc] = (await groupRef.collection("expenses").get()).docs;
    expect(doc.data().receipt).toEqual(receipt);
    expect(doc.data().splits).toEqual({
      max: { rawValue: 2050, amountMinor: 2050 },
      lea: { rawValue: 1625, amountMinor: 1625 },
      oma: { rawValue: 775, amountMinor: 775 },
    });
    expect((await readGroup("g1")).balancesMinor).toEqual({ max: 2400, lea: -1625, oma: -775 });
  });

  it("spreads a tip by what each person had", async () => {
    const groupRef = await seedDinnerTable();
    signInAs({ uid: "max" });
    // 5,50 tip on 44,50: Max 20,50 → +2,53, Lea 16,25 → +2,00(+1), Oma 7,75 → +0,95(+1);
    // the two leftover cents go to the largest remainders (Lea ,84 and Oma ,79).
    const result = await addExpense({
      ...receiptExpense,
      amountMinor: 5000,
      paidBy: { max: 5000 },
      splitInputs: { max: 2303, lea: 1826, oma: 871 },
    });
    expect(result).toEqual({ ok: true, data: { expenseId: expect.any(String) } });
    expect((await groupRef.collection("expenses").get()).size).toBe(1);
  });

  it("refuses amounts that don't match the items — the stored story must be the booked one", async () => {
    const groupRef = await seedDinnerTable();
    signInAs({ uid: "max" });
    const result = await addExpense({
      ...receiptExpense,
      splitInputs: { max: 1450, lea: 2225, oma: 775 },
    });
    expect(result).toEqual({ ok: false, error: "invalid-split" });
    expect((await groupRef.collection("expenses").get()).empty).toBe(true);
  });

  it.each<[string, Partial<ExpenseInput>]>([
    ["with an equal split", { splitMode: "equal", participantUids: ["max", "lea", "oma"] }],
    [
      "as a game's result",
      {
        viaLottery: true,
        game: { gameId: "wheel", playerUids: ["max", "lea", "oma"], attempt: 1 },
      },
    ],
    [
      "naming someone outside the group",
      {
        receipt: {
          items: [{ name: "Cola", quantity: 1, totalMinor: 4450, units: [{ uids: ["mallory"] }] }],
        },
      },
    ],
    [
      "with a malformed item",
      { receipt: { items: [{ name: "Cola", quantity: 2, totalMinor: 4450, units: [] }] } },
    ],
  ])("refuses a receipt %s", async (_, patch) => {
    const groupRef = await seedDinnerTable();
    signInAs({ uid: "max" });
    const result = await addExpense({ ...receiptExpense, ...patch });
    expect(result).toEqual({ ok: false, error: "invalid-receipt" });
    expect((await groupRef.collection("expenses").get()).empty).toBe(true);
  });

  it("stores nothing extra a request carried along", async () => {
    const groupRef = await seedDinnerTable();
    signInAs({ uid: "max" });
    const padded = {
      items: receipt.items.map((item) => ({ ...item, name: ` ${item.name} `, note: "x" })),
      photo: "data:…",
    } as unknown as ExpenseReceipt;
    expect((await addExpense({ ...receiptExpense, receipt: padded })).ok).toBe(true);
    const [doc] = (await groupRef.collection("expenses").get()).docs;
    expect(doc.data().receipt).toEqual(receipt);
  });

  it("drops the items when an edit replaces the split by hand", async () => {
    const groupRef = await seedDinnerTable();
    signInAs({ uid: "max" });
    const added = await addExpense(receiptExpense);
    if (!added.ok) throw new Error(added.error);

    const edited = await editExpense({
      ...receiptExpense,
      expenseId: added.data.expenseId,
      splitMode: "equal",
      participantUids: ["max", "lea"],
      splitInputs: {},
      receipt: null,
    });
    expect(edited.ok).toBe(true);
    const doc = await groupRef.collection("expenses").doc(added.data.expenseId).get();
    expect(doc.data()?.receipt).toBeNull();
  });
});

describe("scanReceipt", () => {
  const image = "data:image/jpeg;base64,/9j/AAAA";
  const realFetch = globalThis.fetch;
  let modelCalls = 0;

  beforeEach(() => {
    modelCalls = 0;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    // Only the model endpoint is faked; the emulator's own requests go through.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
      modelCalls++;
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    merchant: "Krone",
                    date: "2026-10-15",
                    total: 44.5,
                    items: [
                      { name: "Cola", quantity: 3, total: 10.5 },
                      { name: "Käsespätzle", quantity: 4, total: 34 },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it("reads the items for a member, and stores neither photo nor items", async () => {
    await seedDinnerTable();
    process.env.GEMINI_API_KEY = "test-key";
    signInAs({ uid: "lea" });

    expect(await scanReceipt({ groupId: "g1", image })).toEqual({
      ok: true,
      data: {
        merchant: "Krone",
        date: "2026-10-15",
        totalMinor: 4450,
        items: [
          { name: "Cola", quantity: 3, totalMinor: 1050 },
          { name: "Käsespätzle", quantity: 4, totalMinor: 3400 },
        ],
      },
    });
    expect(modelCalls).toBe(1);
    const scans = await adminDb.collection("receiptScans").doc("lea").get();
    expect(scans.data()).toEqual({ day: expect.any(String), count: 1 });
    expect((await adminDb.collection("groups").doc("g1").collection("expenses").get()).empty).toBe(
      true,
    );
  });

  it("refuses strangers, signed-out callers and unknown groups before calling a model", async () => {
    await seedDinnerTable();
    process.env.GEMINI_API_KEY = "test-key";
    signInAs({ uid: "mallory" });
    expect(await scanReceipt({ groupId: "g1", image })).toEqual({ ok: false, error: "forbidden" });
    signInAs({ uid: "lea" });
    expect(await scanReceipt({ groupId: "nope", image })).toEqual({
      ok: false,
      error: "not-found",
    });
    signOut();
    expect(await scanReceipt({ groupId: "g1", image })).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(modelCalls).toBe(0);
  });

  it.each([
    ["not a data URL", "https://example.com/receipt.jpg"],
    ["a type the client never sends", "data:image/svg+xml;base64,PHN2Zz4="],
    ["base64 with junk in it", "data:image/jpeg;base64,abc<script>"],
    ["too large for a Server Action", `data:image/jpeg;base64,${"A".repeat(900_000)}`],
  ])("refuses an image that is %s", async (_, bad) => {
    await seedDinnerTable();
    process.env.GEMINI_API_KEY = "test-key";
    signInAs({ uid: "lea" });
    expect(await scanReceipt({ groupId: "g1", image: bad })).toEqual({
      ok: false,
      error: "invalid-image",
    });
    expect(modelCalls).toBe(0);
  });

  it("says so when no model is configured", async () => {
    await seedDinnerTable();
    signInAs({ uid: "lea" });
    expect(await scanReceipt({ groupId: "g1", image })).toEqual({
      ok: false,
      error: "scan-unavailable",
    });
  });

  it("stops a user at the daily limit, without touching anyone else's", async () => {
    await seedDinnerTable();
    process.env.GEMINI_API_KEY = "test-key";
    const today = new Date().toISOString().slice(0, 10);
    await adminDb
      .collection("receiptScans")
      .doc("lea")
      .set({ day: today, count: RECEIPT_SCANS_PER_DAY });
    // Yesterday's count doesn't carry over.
    await adminDb.collection("receiptScans").doc("max").set({ day: "2000-01-01", count: 999 });

    signInAs({ uid: "lea" });
    expect(await scanReceipt({ groupId: "g1", image })).toEqual({
      ok: false,
      error: "scan-limit",
    });
    expect(modelCalls).toBe(0);

    signInAs({ uid: "max" });
    expect((await scanReceipt({ groupId: "g1", image })).ok).toBe(true);
    expect((await adminDb.collection("receiptScans").doc("max").get()).data()).toEqual({
      day: today,
      count: 1,
    });
  });
});
