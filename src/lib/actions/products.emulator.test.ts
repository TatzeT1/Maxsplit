import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addExpense, editExpense, type ExpenseInput } from "@/lib/actions/expenses";
import { classifyGroupExpenses, setExpenseProduct } from "@/lib/actions/products";
import { aiUsageMonth } from "@/lib/ai/limits";
import { adminDb } from "@/lib/firebase/admin";
import { classifyExpenseSnapshots } from "@/lib/products/classify-expenses";
import { CLASSIFY_RUNS_PER_DAY } from "@/lib/products/products";
import type { Expense, ReceiptItem } from "@/lib/types";
import { scheduledClassifications } from "@/test/classify-mock";
import { realMember, seedExpense, seedGroup } from "@/test/fixtures";
import { signInAs, signOut } from "@/test/session-mock";

// 📊 Auswertung: what expenses and receipt lines are (ProductClass) — set
// by the scan, classified after saving, caught up on by "Jetzt einordnen",
// corrected by a member.

async function seedFlat() {
  return seedGroup("g1", { max: realMember("Max", { role: "owner" }), lea: realMember("Lea") });
}

const plain: ExpenseInput = {
  groupId: "g1",
  description: "Miete Oktober",
  amountMinor: 80000,
  currency: "EUR",
  date: "2026-10-01",
  category: "housing",
  emoji: null,
  paidBy: { max: 80000 },
  splitMode: "equal",
  participantUids: ["max", "lea"],
  splitInputs: {},
  viaLottery: false,
};

const mett: ReceiptItem = {
  name: "Schweinemett",
  quantity: 1,
  totalMinor: 320,
  units: [{ uids: ["max"] }],
  product: { family: "meat", kind: "Mett" },
};
const bread: ReceiptItem = {
  name: "Vollkornbrot",
  quantity: 1,
  totalMinor: 250,
  units: [{ uids: ["lea"] }],
};

const receiptExpense: ExpenseInput = {
  ...plain,
  description: "Metzgerei",
  amountMinor: 570,
  category: "groceries",
  paidBy: { max: 570 },
  splitMode: "exact",
  participantUids: [],
  splitInputs: { max: 320, lea: 250 },
  receipt: { items: [mett, bread] },
};

async function readExpense(id: string): Promise<Omit<Expense, "id">> {
  const snap = await adminDb.collection("groups").doc("g1").collection("expenses").doc(id).get();
  return snap.data() as Omit<Expense, "id">;
}

/** Answers every model request: each numbered line the prompt lists, by what it contains. */
function fakeModel() {
  const realFetch = globalThis.fetch;
  const prompts: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    const prompt: string = JSON.parse(String(init?.body)).contents[0].parts.at(-1).text;
    prompts.push(prompt);
    const items = [...prompt.matchAll(/^(\d+): "([^"]*)"/gm)].map(([, i, text]) => {
      if (/miete/i.test(text)) return { i: Number(i), family: "housing", kind: "Miete" };
      if (/brot/i.test(text)) return { i: Number(i), family: "bakery", kind: "brot" };
      return { i: Number(i), family: "other", kind: "Sonstiges" };
    });
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }],
    });
  });
  return prompts;
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "test-model";
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  vi.restoreAllMocks();
  signOut();
});

describe("saving an expense", () => {
  it("schedules classifying an expense without a receipt, after the response", async () => {
    await seedFlat();
    signInAs({ uid: "max" });
    const added = await addExpense(plain);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(scheduledClassifications).toEqual([
      { groupId: "g1", expenseId: added.data.expenseId, uid: "max" },
    ]);
    expect(await readExpense(added.data.expenseId)).not.toHaveProperty("product");
  });

  it("stores a receipt's line classes, and schedules only for lines without one", async () => {
    await seedFlat();
    signInAs({ uid: "max" });
    const added = await addExpense(receiptExpense);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const stored = await readExpense(added.data.expenseId);
    expect(stored.receipt?.items.map((item) => item.product)).toEqual([
      { family: "meat", kind: "Mett" },
      undefined,
    ]);
    expect(scheduledClassifications).toHaveLength(1);

    const classified = await addExpense({
      ...receiptExpense,
      receipt: { items: [mett, { ...bread, product: { family: "bakery", kind: "Brot" } }] },
    });
    expect(classified.ok).toBe(true);
    expect(scheduledClassifications).toHaveLength(1);
  });

  it("refuses a receipt line with a malformed class", async () => {
    await seedFlat();
    signInAs({ uid: "max" });
    const result = await addExpense({
      ...receiptExpense,
      receipt: {
        items: [
          { ...mett, product: { family: "wurst", kind: "Mett" } } as unknown as ReceiptItem,
          bread,
        ],
      },
    });
    expect(result).toEqual({ ok: false, error: "invalid-receipt" });
  });

  it("keeps the class through an edit that leaves the description, drops it otherwise", async () => {
    const groupRef = await seedFlat();
    const expenseId = await seedExpense(
      groupRef,
      "max",
      { max: 40000, lea: 40000 },
      {
        description: "Miete Oktober",
        product: { family: "housing", kind: "Miete" },
      },
    );
    signInAs({ uid: "max" });

    expect(
      (await editExpense({ ...plain, expenseId, amountMinor: 81000, paidBy: { max: 81000 } })).ok,
    ).toBe(true);
    expect((await readExpense(expenseId)).product).toEqual({ family: "housing", kind: "Miete" });
    expect(scheduledClassifications).toEqual([]);

    expect((await editExpense({ ...plain, expenseId, description: "Strom" })).ok).toBe(true);
    expect(await readExpense(expenseId)).not.toHaveProperty("product");
    expect(scheduledClassifications).toEqual([{ groupId: "g1", expenseId, uid: "max" }]);
  });
});

describe("classifyExpenseSnapshots", () => {
  it("classifies descriptions and receipt lines in one request, and writes them back", async () => {
    const prompts = fakeModel();
    const groupRef = await seedFlat();
    const rentId = await seedExpense(
      groupRef,
      "max",
      { max: 100 },
      { description: "Miete Oktober" },
    );
    const receiptId = await seedExpense(
      groupRef,
      "max",
      { max: 320, lea: 250 },
      {
        description: "Metzgerei",
        receipt: { items: [mett, bread] },
      },
    );
    const refs = [rentId, receiptId].map((id) => groupRef.collection("expenses").doc(id));
    const count = await classifyExpenseSnapshots(await Promise.all(refs.map((ref) => ref.get())));

    expect(count).toBe(2);
    expect(prompts).toHaveLength(1);
    // The line that has a class already is not asked about.
    expect(prompts[0]).not.toMatch(/^\d+: "Schweinemett"/m);
    expect(prompts[0]).toMatch(/^\d+: "Vollkornbrot"/m);
    expect((await readExpense(rentId)).product).toEqual({ family: "housing", kind: "Miete" });
    expect((await readExpense(receiptId)).receipt?.items.map((item) => item.product)).toEqual([
      { family: "meat", kind: "Mett" },
      { family: "bakery", kind: "Brot" },
    ]);
  });

  it("lets an edit made in the meantime win", async () => {
    fakeModel();
    const groupRef = await seedFlat();
    const expenseId = await seedExpense(groupRef, "max", { max: 100 }, { description: "Miete" });
    const ref = groupRef.collection("expenses").doc(expenseId);
    const before = await ref.get();
    await ref.update({ description: "Brötchen" });

    expect(await classifyExpenseSnapshots([before])).toBe(0);
    expect(await readExpense(expenseId)).not.toHaveProperty("product");
  });
});

describe("classifyGroupExpenses", () => {
  it("catches up on what is missing and says what remains", async () => {
    fakeModel();
    const groupRef = await seedFlat();
    await seedExpense(groupRef, "max", { max: 100 }, { description: "Miete" });
    await seedExpense(
      groupRef,
      "max",
      { max: 100 },
      {
        description: "Brot",
        product: { family: "bakery", kind: "Brot" },
      },
    );
    await seedExpense(
      groupRef,
      "max",
      { max: 100 },
      { description: "Alt", deletedAt: "2026-10-01T00:00:00Z" },
    );
    signInAs({ uid: "lea" });

    expect(await classifyGroupExpenses({ groupId: "g1" })).toEqual({
      ok: true,
      data: { classified: 1, remaining: 0 },
    });
    // Nothing left: no model request, no quota spent.
    expect(await classifyGroupExpenses({ groupId: "g1" })).toEqual({
      ok: true,
      data: { classified: 0, remaining: 0 },
    });
    const quota = await adminDb.collection("productClassifyRuns").doc("lea").get();
    expect(quota.data()?.count).toBe(1);
  });

  it("is for members only, needs a model, and stops at the daily limit", async () => {
    fakeModel();
    const groupRef = await seedFlat();
    await seedExpense(groupRef, "max", { max: 100 });

    signInAs({ uid: "stranger" });
    expect(await classifyGroupExpenses({ groupId: "g1" })).toEqual({
      ok: false,
      error: "forbidden",
    });

    signInAs({ uid: "max" });
    delete process.env.GEMINI_API_KEY;
    expect(await classifyGroupExpenses({ groupId: "g1" })).toEqual({
      ok: false,
      error: "scan-unavailable",
    });

    process.env.GEMINI_API_KEY = "test-key";
    const today = new Date().toISOString().slice(0, 10);
    await adminDb
      .collection("productClassifyRuns")
      .doc("max")
      .set({ day: today, count: CLASSIFY_RUNS_PER_DAY });
    expect(await classifyGroupExpenses({ groupId: "g1" })).toEqual({
      ok: false,
      error: "classify-limit",
    });
  });

  it("counts against the group's AI allowance, and stops a blocked group before any run", async () => {
    fakeModel();
    const groupRef = await seedFlat();
    await seedExpense(groupRef, "max", { max: 100 }, { description: "Miete" });
    signInAs({ uid: "max" });

    await groupRef.update({ aiRequestLimit: 0 });
    expect(await classifyGroupExpenses({ groupId: "g1" })).toEqual({
      ok: false,
      error: "ai-limit",
    });
    expect((await adminDb.collection("productClassifyRuns").doc("max").get()).exists).toBe(false);

    await groupRef.update({ aiRequestLimit: null });
    expect((await classifyGroupExpenses({ groupId: "g1" })).ok).toBe(true);
    const usage = await groupRef.collection("aiUsage").doc(aiUsageMonth()).get();
    expect(usage.data()?.count).toBe(1);
    const [call] = (await groupRef.collection("aiCalls").get()).docs;
    expect(call.data()).toMatchObject({
      kind: "classify",
      uid: "max",
      ok: true,
      summary: ["Miete"],
    });
  });
});

describe("setExpenseProduct", () => {
  it("lets any member correct an expense's class, normalized", async () => {
    const groupRef = await seedFlat();
    const expenseId = await seedExpense(groupRef, "max", { max: 100 });
    signInAs({ uid: "lea" });
    expect(
      await setExpenseProduct({ groupId: "g1", expenseId, family: "meat", kind: "  mett " }),
    ).toEqual({ ok: true, data: null });
    expect((await readExpense(expenseId)).product).toEqual({ family: "meat", kind: "Mett" });
  });

  it("refuses an unknown family, a receipt's expense and strangers", async () => {
    const groupRef = await seedFlat();
    const expenseId = await seedExpense(groupRef, "max", { max: 100 });
    const receiptId = await seedExpense(
      groupRef,
      "max",
      { max: 320, lea: 250 },
      {
        receipt: { items: [mett, bread] },
      },
    );
    signInAs({ uid: "max" });
    expect(
      await setExpenseProduct({ groupId: "g1", expenseId, family: "wurst", kind: "Mett" }),
    ).toEqual({ ok: false, error: "invalid-product" });
    expect(
      await setExpenseProduct({
        groupId: "g1",
        expenseId: receiptId,
        family: "meat",
        kind: "Mett",
      }),
    ).toEqual({ ok: false, error: "invalid-product" });
    signInAs({ uid: "stranger" });
    expect(
      await setExpenseProduct({ groupId: "g1", expenseId, family: "meat", kind: "Mett" }),
    ).toEqual({ ok: false, error: "forbidden" });
  });
});
