"use server";

// Shopping lists (brain: Shopping Lists). They move no money, so any member
// may do anything here — create, rename and delete lists, add, edit, tick and
// remove items, also for someone else. Ids of new lists and items are chosen
// by the client, which makes a retried create safe. Ticking says what the
// end state should be and when the tap happened, so a tick sent late from a
// phone that was offline in the shop can't undo a newer one (ADR-009).

import { FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { classifyShoppingItemAfterResponse } from "@/lib/shopping/classify-after";
import {
  MAX_ITEMS_PER_LIST,
  MAX_ITEM_NAME_LENGTH,
  MAX_LISTS_PER_GROUP,
  MAX_LIST_NAME_LENGTH,
  MAX_QUANTITY_LENGTH,
  SHOPPING_ID,
  addToCatalog,
  cleanText,
  normalizeItemProduct,
  normalizeListIcon,
  shoppingNameKey,
} from "@/lib/shopping/shopping";
import type { Group, ProductClass, ShoppingCatalog, ShoppingItem, ShoppingList } from "@/lib/types";
import type { ActionResult } from "./groups";

/** Firestore's gRPC status codes, as the Admin SDK reports them on `error.code`. */
const ALREADY_EXISTS = 6;

type GroupRef = FirebaseFirestore.DocumentReference;

async function requireMember(
  groupId: unknown,
  uid: string,
): Promise<{ groupRef: GroupRef; group: Omit<Group, "id"> } | { error: string }> {
  if (typeof groupId !== "string" || !groupId || groupId.includes("/")) {
    return { error: "not-found" };
  }
  const groupSnap = await adminDb.collection("groups").doc(groupId).get();
  if (!groupSnap.exists) return { error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(uid)) return { error: "forbidden" };
  return { groupRef: groupSnap.ref, group };
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && SHOPPING_ID.test(value);

/** A list that exists, or the error to answer with. */
async function requireList(
  groupRef: GroupRef,
  listId: unknown,
): Promise<{ listRef: GroupRef } | { error: string }> {
  if (!isId(listId)) return { error: "invalid-id" };
  const listRef = groupRef.collection("shoppingLists").doc(listId);
  if (!(await listRef.get()).exists) return { error: "not-found" };
  return { listRef };
}

/** `null` (for everyone), a uid in the group's members (placeholders included), or `undefined` = invalid. */
function normalizeForUid(value: unknown, group: Omit<Group, "id">): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" && Object.hasOwn(group.members, value) ? value : undefined;
}

/** The quantity as stored: trimmed text or null; `undefined` when it isn't text at all. */
function normalizeQuantity(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return cleanText(value, MAX_QUANTITY_LENGTH);
}

/**
 * Recounts the list's open items into `openCount` (what the group page's
 * card shows) after an item changed. Display only, so a count that loses a
 * race with a simultaneous change is corrected by the next one.
 */
async function refreshOpenCount(listRef: GroupRef): Promise<void> {
  const open = await listRef.collection("items").where("checked", "==", false).count().get();
  await listRef.update({ openCount: open.data().count, updatedAt: new Date().toISOString() });
}

export async function createShoppingList(input: {
  groupId: string;
  listId: string;
  name: string;
  icon?: string | null;
}): Promise<ActionResult<{ listId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isId(input.listId)) return { ok: false, error: "invalid-id" };
  const name = cleanText(input.name, MAX_LIST_NAME_LENGTH);
  if (!name) return { ok: false, error: "invalid-name" };

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const lists = membership.groupRef.collection("shoppingLists");

  const listRef = lists.doc(input.listId);
  const existing = await listRef.get();
  // The retry of a create that did go through.
  if (existing.exists) {
    return existing.get("createdBy") === session.uid
      ? { ok: true, data: { listId: listRef.id } }
      : { ok: false, error: "invalid-id" };
  }
  if ((await lists.count().get()).data().count >= MAX_LISTS_PER_GROUP) {
    return { ok: false, error: "too-many-lists" };
  }

  const now = new Date().toISOString();
  const list: Omit<ShoppingList, "id"> = {
    name,
    icon: normalizeListIcon(input.icon),
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now,
    openCount: 0,
  };
  try {
    await listRef.create(list);
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
  }
  return { ok: true, data: { listId: listRef.id } };
}

export async function updateShoppingList(input: {
  groupId: string;
  listId: string;
  name: string;
  icon?: string | null;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const name = cleanText(input.name, MAX_LIST_NAME_LENGTH);
  if (!name) return { ok: false, error: "invalid-name" };

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const found = await requireList(membership.groupRef, input.listId);
  if ("error" in found) return { ok: false, error: found.error };

  await found.listRef.update({
    name,
    icon: normalizeListIcon(input.icon),
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, data: null };
}

/** Deletes a list and every item on it. */
export async function deleteShoppingList(input: {
  groupId: string;
  listId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  if (!isId(input.listId)) return { ok: false, error: "invalid-id" };

  // Gone already is fine: a retried delete, or two people deleting at once.
  await adminDb.recursiveDelete(membership.groupRef.collection("shoppingLists").doc(input.listId));
  return { ok: true, data: null };
}

/**
 * Puts something on a list. The aisle comes from what the client picked (a
 * suggestion carries its class), else from the group's catalog, else from a
 * model after the response.
 */
export async function addShoppingItem(input: {
  groupId: string;
  listId: string;
  itemId: string;
  name: string;
  quantity?: string | null;
  forUid?: string | null;
  product?: ProductClass | null;
}): Promise<ActionResult<{ itemId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isId(input.itemId)) return { ok: false, error: "invalid-id" };
  const name = cleanText(input.name, MAX_ITEM_NAME_LENGTH);
  if (!name) return { ok: false, error: "invalid-name" };
  const quantity = normalizeQuantity(input.quantity);
  if (quantity === undefined) return { ok: false, error: "invalid-quantity" };

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { groupRef, group } = membership;
  const forUid = normalizeForUid(input.forUid, group);
  if (forUid === undefined) return { ok: false, error: "invalid-member" };
  const found = await requireList(groupRef, input.listId);
  if ("error" in found) return { ok: false, error: found.error };
  const { listRef } = found;

  const itemRef = listRef.collection("items").doc(input.itemId);
  const existing = await itemRef.get();
  if (existing.exists) {
    return existing.get("addedBy") === session.uid
      ? { ok: true, data: { itemId: itemRef.id } }
      : { ok: false, error: "invalid-id" };
  }
  if ((await listRef.collection("items").count().get()).data().count >= MAX_ITEMS_PER_LIST) {
    return { ok: false, error: "too-many-items" };
  }

  const catalogRef = groupRef.collection("shoppingState").doc("catalog");
  const now = new Date().toISOString();
  let product: ProductClass | null = null;
  try {
    product = await adminDb.runTransaction(async (tx) => {
      const catalog = (await tx.get(catalogRef)).data() as ShoppingCatalog | undefined;
      const known =
        normalizeItemProduct(input.product) ??
        catalog?.entries?.[shoppingNameKey(name)]?.product ??
        null;
      const item: Omit<ShoppingItem, "id"> = {
        name,
        quantity,
        forUid,
        addedBy: session.uid,
        createdAt: now,
        checked: false,
        checkedBy: null,
        checkedChangedAt: null,
        ...(known ? { product: known } : {}),
      };
      tx.create(itemRef, item);
      tx.set(catalogRef, addToCatalog(catalog, name, known, now));
      return known;
    });
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
    // A retry racing its own first attempt: that one won.
    return { ok: true, data: { itemId: itemRef.id } };
  }

  await refreshOpenCount(listRef);
  if (!product)
    classifyShoppingItemAfterResponse(input.groupId, listRef.id, itemRef.id, session.uid);
  return { ok: true, data: { itemId: itemRef.id } };
}

/** Changes an item's name, quantity or whom it's for. A new name is put in its aisle anew. */
export async function updateShoppingItem(input: {
  groupId: string;
  listId: string;
  itemId: string;
  name: string;
  quantity: string | null;
  forUid: string | null;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isId(input.itemId)) return { ok: false, error: "invalid-id" };
  const name = cleanText(input.name, MAX_ITEM_NAME_LENGTH);
  if (!name) return { ok: false, error: "invalid-name" };
  const quantity = normalizeQuantity(input.quantity);
  if (quantity === undefined) return { ok: false, error: "invalid-quantity" };

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { groupRef, group } = membership;
  const forUid = normalizeForUid(input.forUid, group);
  if (forUid === undefined) return { ok: false, error: "invalid-member" };
  const found = await requireList(groupRef, input.listId);
  if ("error" in found) return { ok: false, error: found.error };

  const itemRef = found.listRef.collection("items").doc(input.itemId);
  const catalogRef = groupRef.collection("shoppingState").doc("catalog");
  const result = await adminDb.runTransaction(async (tx) => {
    const [snap, catalogSnap] = await Promise.all([tx.get(itemRef), tx.get(catalogRef)]);
    if (!snap.exists) return "not-found" as const;
    const item = snap.data() as Omit<ShoppingItem, "id">;
    const update: Record<string, unknown> = { name, quantity, forUid };
    let needsClass = false;
    if (shoppingNameKey(item.name) !== shoppingNameKey(name)) {
      const known = (catalogSnap.data() as ShoppingCatalog | undefined)?.entries?.[
        shoppingNameKey(name)
      ]?.product;
      update.product = known ?? FieldValue.delete();
      needsClass = !known;
    }
    tx.update(itemRef, update);
    return needsClass ? ("classify" as const) : ("done" as const);
  });
  if (result === "not-found") return { ok: false, error: "not-found" };
  if (result === "classify") {
    classifyShoppingItemAfterResponse(input.groupId, input.listId, input.itemId, session.uid);
  }
  return { ok: true, data: null };
}

/**
 * Ticks an item off (or back on). `changedAt` is when the tap happened on the
 * caller's device — maybe minutes ago, in a shop without reception. The newer
 * tap wins: a tick older than the one already stored is acknowledged but not
 * applied (`applied: false`). A time in the future is taken as now, so a
 * phone whose clock runs ahead can't lock an item against everyone else.
 */
export async function setShoppingItemChecked(input: {
  groupId: string;
  listId: string;
  itemId: string;
  checked: boolean;
  changedAt: string;
}): Promise<ActionResult<{ applied: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const tapped = Date.parse(input.changedAt);
  if (
    typeof input.checked !== "boolean" ||
    typeof input.changedAt !== "string" ||
    !Number.isFinite(tapped) ||
    !isId(input.itemId) ||
    !isId(input.listId)
  ) {
    return { ok: false, error: "invalid-input" };
  }
  const changedAt = new Date(Math.min(tapped, Date.now())).toISOString();

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const listRef = membership.groupRef.collection("shoppingLists").doc(input.listId);
  const itemRef = listRef.collection("items").doc(input.itemId);
  const outcome = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) return "not-found" as const;
    const stored = (snap.data() as Omit<ShoppingItem, "id">).checkedChangedAt;
    if (stored && stored >= changedAt) return "stale" as const;
    tx.update(itemRef, {
      checked: input.checked,
      checkedBy: input.checked ? session.uid : null,
      checkedChangedAt: changedAt,
    });
    return "applied" as const;
  });
  if (outcome === "not-found") return { ok: false, error: "not-found" };
  if (outcome === "applied") await refreshOpenCount(listRef);
  return { ok: true, data: { applied: outcome === "applied" } };
}

export async function deleteShoppingItem(input: {
  groupId: string;
  listId: string;
  itemId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isId(input.itemId)) return { ok: false, error: "invalid-id" };

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const found = await requireList(membership.groupRef, input.listId);
  if ("error" in found) return { ok: false, error: found.error };

  await found.listRef.collection("items").doc(input.itemId).delete();
  await refreshOpenCount(found.listRef);
  return { ok: true, data: null };
}

/** "Erledigte entfernen": deletes every checked item on the list. */
export async function clearCheckedShoppingItems(input: {
  groupId: string;
  listId: string;
}): Promise<ActionResult<{ removed: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireMember(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const found = await requireList(membership.groupRef, input.listId);
  if ("error" in found) return { ok: false, error: found.error };

  // ≤ MAX_ITEMS_PER_LIST, inside one batch's 500 writes.
  const checked = await found.listRef.collection("items").where("checked", "==", true).get();
  const batch = adminDb.batch();
  checked.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  await refreshOpenCount(found.listRef);
  return { ok: true, data: { removed: checked.size } };
}
