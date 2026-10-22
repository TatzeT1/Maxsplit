import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addShoppingItem,
  clearCheckedShoppingItems,
  createShoppingList,
  deleteShoppingItem,
  deleteShoppingList,
  setShoppingItemChecked,
  updateShoppingItem,
  updateShoppingList,
} from "@/lib/actions/shopping";
import { adminDb } from "@/lib/firebase/admin";
import { classifyShoppingItem } from "@/lib/shopping/classify";
import { shoppingNameKey } from "@/lib/shopping/shopping";
import { placeholderMember, realMember, seedGroup } from "@/test/fixtures";
import { signInAs, signOut } from "@/test/session-mock";
import { scheduledShoppingClassifications } from "@/test/shopping-classify-mock";
import type { ShoppingCatalog, ShoppingItem, ShoppingList } from "@/lib/types";

// Shopping lists against the Firestore emulator: lists and items, retry-safe
// creates, the newer tap winning over a late offline tick (ADR-009), the
// open count, the catalog and the aisle classification.

const LIST = "list-0000000000000001";
const ITEM = "item-0000000000000001";
const ITEM2 = "item-0000000000000002";

async function seedCouple() {
  return seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    oma: placeholderMember("Oma"),
  });
}

const listRef = () => adminDb.doc(`groups/g1/shoppingLists/${LIST}`);
const readList = async () => (await listRef().get()).data() as Omit<ShoppingList, "id">;
const readItem = async (id = ITEM) =>
  (await listRef().collection("items").doc(id).get()).data() as Omit<ShoppingItem, "id">;
const readCatalog = async () =>
  (await adminDb.doc("groups/g1/shoppingState/catalog").get()).data() as ShoppingCatalog;

async function withList() {
  await seedCouple();
  signInAs({ uid: "max" });
  expect(
    await createShoppingList({ groupId: "g1", listId: LIST, name: " Rewe ", icon: "🛒" }),
  ).toEqual({ ok: true, data: { listId: LIST } });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  signOut();
});

describe("lists", () => {
  it("creates a list once, however often the create is retried", async () => {
    await withList();
    expect(await createShoppingList({ groupId: "g1", listId: LIST, name: "Rewe" })).toEqual({
      ok: true,
      data: { listId: LIST },
    });
    expect(await readList()).toMatchObject({
      name: "Rewe",
      icon: "🛒",
      createdBy: "max",
      openCount: 0,
    });
    expect((await adminDb.collection("groups/g1/shoppingLists").get()).size).toBe(1);
  });

  it("doesn't let someone else take over a list id, or a non-member create one", async () => {
    await withList();
    signInAs({ uid: "lea" });
    expect(await createShoppingList({ groupId: "g1", listId: LIST, name: "Meins" })).toEqual({
      ok: false,
      error: "invalid-id",
    });
    signInAs({ uid: "stranger" });
    expect(
      await createShoppingList({ groupId: "g1", listId: "list-0000000000000009", name: "x" }),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("refuses a malformed id, an empty name and drops an unknown icon", async () => {
    await seedCouple();
    signInAs({ uid: "max" });
    expect(await createShoppingList({ groupId: "g1", listId: "a/b", name: "x" })).toEqual({
      ok: false,
      error: "invalid-id",
    });
    expect(await createShoppingList({ groupId: "g1", listId: LIST, name: "   " })).toEqual({
      ok: false,
      error: "invalid-name",
    });
    await createShoppingList({ groupId: "g1", listId: LIST, name: "dm", icon: "💣" });
    expect((await readList()).icon).toBeNull();
  });

  it("lets any member rename a list and delete it with everything on it", async () => {
    await withList();
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM, name: "Milch" });
    signInAs({ uid: "lea" });
    expect(
      await updateShoppingList({ groupId: "g1", listId: LIST, name: "Edeka", icon: "🥦" }),
    ).toEqual({ ok: true, data: null });
    expect(await readList()).toMatchObject({ name: "Edeka", icon: "🥦" });
    expect(await deleteShoppingList({ groupId: "g1", listId: LIST })).toEqual({
      ok: true,
      data: null,
    });
    expect((await listRef().get()).exists).toBe(false);
    expect((await listRef().collection("items").get()).size).toBe(0);
  });
});

describe("items", () => {
  it("adds an item once per id, counts it open and remembers the name", async () => {
    await withList();
    const input = {
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      name: "  Hafer milch ",
      quantity: " 2 Packungen ",
      forUid: "oma",
    };
    expect(await addShoppingItem(input)).toEqual({ ok: true, data: { itemId: ITEM } });
    expect(await addShoppingItem(input)).toEqual({ ok: true, data: { itemId: ITEM } });
    expect(await readItem()).toMatchObject({
      name: "Hafer milch",
      quantity: "2 Packungen",
      forUid: "oma",
      addedBy: "max",
      checked: false,
      checkedChangedAt: null,
    });
    expect((await readList()).openCount).toBe(1);
    expect((await readCatalog()).entries[shoppingNameKey("hafer milch")]).toMatchObject({
      name: "Hafer milch",
      count: 1,
    });
    // No aisle known: classified after the response — once, not for the retry.
    expect(scheduledShoppingClassifications).toEqual([
      { groupId: "g1", listId: LIST, itemId: ITEM, uid: "max" },
    ]);
  });

  it("takes a picked suggestion's aisle, then knows it from the catalog next time", async () => {
    await withList();
    await addShoppingItem({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      name: "Milch",
      product: { family: "dairy", kind: "Milch" },
    });
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM2, name: "milch" });
    expect((await readItem(ITEM2)).product).toEqual({ family: "dairy", kind: "Milch" });
    expect(scheduledShoppingClassifications).toEqual([]);
    expect((await readCatalog()).entries.milch.count).toBe(2);
  });

  it("refuses someone outside the group as the item's person, and a missing list", async () => {
    await withList();
    expect(
      await addShoppingItem({
        groupId: "g1",
        listId: LIST,
        itemId: ITEM,
        name: "Bier",
        forUid: "constructor",
      }),
    ).toEqual({ ok: false, error: "invalid-member" });
    expect(
      await addShoppingItem({
        groupId: "g1",
        listId: "list-0000000000000404",
        itemId: ITEM,
        name: "Bier",
      }),
    ).toEqual({ ok: false, error: "not-found" });
  });

  it("edits an item; a new name drops its old aisle and is classified again", async () => {
    await withList();
    await addShoppingItem({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      name: "Milch",
      product: { family: "dairy", kind: "Milch" },
    });
    signInAs({ uid: "lea" });
    await updateShoppingItem({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      name: "Milch",
      quantity: "1 l",
      forUid: "lea",
    });
    expect(await readItem()).toMatchObject({ quantity: "1 l", forUid: "lea" });
    expect((await readItem()).product).toEqual({ family: "dairy", kind: "Milch" });

    await updateShoppingItem({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      name: "Zahnpasta",
      quantity: null,
      forUid: null,
    });
    expect(await readItem()).not.toHaveProperty("product");
    expect(scheduledShoppingClassifications).toEqual([
      { groupId: "g1", listId: LIST, itemId: ITEM, uid: "lea" },
    ]);
  });

  it("deletes an item and clears the checked ones", async () => {
    await withList();
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM, name: "Milch" });
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM2, name: "Brot" });
    await setShoppingItemChecked({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      checked: true,
      changedAt: new Date().toISOString(),
    });
    expect(await clearCheckedShoppingItems({ groupId: "g1", listId: LIST })).toEqual({
      ok: true,
      data: { removed: 1 },
    });
    expect((await listRef().collection("items").get()).docs.map((d) => d.id)).toEqual([ITEM2]);
    await deleteShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM2 });
    expect((await listRef().collection("items").get()).size).toBe(0);
    expect((await readList()).openCount).toBe(0);
  });
});

describe("ticking off (ADR-009)", () => {
  const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();

  it("ticks and unticks, recording who and the open count", async () => {
    await withList();
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM, name: "Milch" });
    signInAs({ uid: "lea" });
    expect(
      await setShoppingItemChecked({
        groupId: "g1",
        listId: LIST,
        itemId: ITEM,
        checked: true,
        changedAt: at(10),
      }),
    ).toEqual({ ok: true, data: { applied: true } });
    expect(await readItem()).toMatchObject({ checked: true, checkedBy: "lea" });
    expect((await readList()).openCount).toBe(0);

    await setShoppingItemChecked({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      checked: false,
      changedAt: at(5),
    });
    expect(await readItem()).toMatchObject({ checked: false, checkedBy: null });
    expect((await readList()).openCount).toBe(1);
  });

  it("a late tick from an offline phone loses to a newer one; a repeat changes nothing", async () => {
    await withList();
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM, name: "Milch" });
    // Lea unticks it now (online)…
    signInAs({ uid: "lea" });
    await setShoppingItemChecked({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      checked: false,
      changedAt: at(1),
    });
    // …while Max's tick from the shop's basement, two minutes ago, only arrives now.
    signInAs({ uid: "max" });
    const late = {
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      checked: true,
      changedAt: at(120),
    };
    expect(await setShoppingItemChecked(late)).toEqual({ ok: true, data: { applied: false } });
    expect(await readItem()).toMatchObject({ checked: false });
  });

  it("takes a time in the future as now, so a fast clock can't lock an item", async () => {
    await withList();
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM, name: "Milch" });
    await setShoppingItemChecked({
      groupId: "g1",
      listId: LIST,
      itemId: ITEM,
      checked: true,
      changedAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(Date.parse((await readItem()).checkedChangedAt!)).toBeLessThanOrEqual(Date.now());
    signInAs({ uid: "lea" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(
      await setShoppingItemChecked({
        groupId: "g1",
        listId: LIST,
        itemId: ITEM,
        checked: false,
        changedAt: new Date().toISOString(),
      }),
    ).toEqual({ ok: true, data: { applied: true } });
  });

  it("answers not-found for an item deleted meanwhile, and refuses garbage", async () => {
    await withList();
    expect(
      await setShoppingItemChecked({
        groupId: "g1",
        listId: LIST,
        itemId: ITEM,
        checked: true,
        changedAt: at(1),
      }),
    ).toEqual({ ok: false, error: "not-found" });
    expect(
      await setShoppingItemChecked({
        groupId: "g1",
        listId: LIST,
        itemId: ITEM,
        checked: true,
        changedAt: "yesterday-ish",
      }),
    ).toEqual({ ok: false, error: "invalid-input" });
  });
});

describe("classifyShoppingItem", () => {
  it("puts the item in its aisle and teaches the catalog", async () => {
    await withList();
    await addShoppingItem({ groupId: "g1", listId: LIST, itemId: ITEM, name: "Gurke" });
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
      const text = JSON.stringify({ items: [{ i: 0, family: "produce", kind: "Gurke" }] });
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    });

    expect(await classifyShoppingItem("g1", LIST, ITEM)).toBe(true);
    expect((await readItem()).product).toEqual({ family: "produce", kind: "Gurke" });
    expect((await readCatalog()).entries.gurke.product).toEqual({
      family: "produce",
      kind: "Gurke",
    });
    // Already placed: nothing more to ask.
    expect(await classifyShoppingItem("g1", LIST, ITEM)).toBe(false);
  });
});
