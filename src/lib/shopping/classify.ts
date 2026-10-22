import "server-only";

// Puts a shopping item into its aisle (a ProductClass) once the response is
// out — the same free models and the same prompt as the Auswertung
// (lib/products/classify.ts). Only names the group's catalog doesn't know
// yet get here: "Milch" is asked once, then remembered, so a weekly list
// doesn't eat the group's monthly AI allowance.

import { groupAiMeter } from "@/lib/ai/usage";
import { adminDb } from "@/lib/firebase/admin";
import { classifyEntries } from "@/lib/products/classify";
import type { AskOptions } from "@/lib/receipt/scan";
import type { ShoppingCatalog, ShoppingItem } from "@/lib/types";
import { shoppingNameKey } from "./shopping";

/**
 * Classifies one item, if it still has no class, and writes the answer to
 * the item (conditional on it not having changed since it was read — a
 * rename in between wins) and to the catalog entry of its name. Returns
 * whether it got one.
 */
export async function classifyShoppingItem(
  groupId: string,
  listId: string,
  itemId: string,
  options: AskOptions = {},
): Promise<boolean> {
  const groupRef = adminDb.collection("groups").doc(groupId);
  const itemRef = groupRef.collection("shoppingLists").doc(listId).collection("items").doc(itemId);
  const snap = await itemRef.get();
  if (!snap.exists || !snap.updateTime) return false;
  const item = snap.data() as Omit<ShoppingItem, "id">;
  if (item.product) return false;

  const [product] = await classifyEntries([{ text: item.name }], options);
  if (!product) return false;

  try {
    await itemRef.update({ product }, { lastUpdateTime: snap.updateTime });
  } catch (error) {
    // 9 = FAILED_PRECONDITION: the item changed (renamed, ticked) meanwhile — its newer state wins.
    if ((error as { code?: unknown }).code !== 9) throw error;
  }

  const key = shoppingNameKey(item.name);
  const catalogRef = groupRef.collection("shoppingState").doc("catalog");
  await adminDb.runTransaction(async (tx) => {
    const catalog = (await tx.get(catalogRef)).data() as ShoppingCatalog | undefined;
    const entry = catalog?.entries?.[key];
    if (!entry || entry.product) return;
    tx.set(catalogRef, { entries: { [key]: { ...entry, product } } }, { merge: true });
  });
  return true;
}

/** The meter an item's classification counts against: the group's AI allowance (AI Usage). */
export function shoppingClassifyOptions(groupId: string, uid: string): AskOptions {
  return { meter: groupAiMeter(groupId, uid, "classify-auto") };
}
