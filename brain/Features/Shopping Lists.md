---
tags: [feature, shopping, offline]
---

# Shopping Lists (🛒 Einkaufslisten)

Plan what to cook, click together what's missing, split up in the shop and tick off live.
Several named lists per group ("Rewe", "dm", "Grillabend"), everyone adds — also things for
someone else ("für Lea") — and **ticking works without reception** (ADR-009). The lists move no
money; the bridge "Einkauf erledigt → Ausgabe anlegen" (the receipt editor pre-filled from the
ticked items, "für wen" already assigned) is the planned next step, not built yet.

| Piece                                                   | Where                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Limits, validation, aisle sorting, catalog, suggestions | `src/lib/shopping/shopping.ts` (shared client/server)               |
| Server Actions                                          | `src/lib/actions/shopping.ts`                                       |
| Offline tick outbox                                     | `src/lib/shopping/pending-checks.ts`                                |
| Outbox sender (every screen, in `(app)/layout.tsx`)     | `src/components/shopping-check-sync.tsx`                            |
| Aisle classification after the response                 | `src/lib/shopping/classify.ts`, `classify-after.ts`                 |
| Card on the group page                                  | `src/components/shopping/shopping-entry-card.tsx`                   |
| Lists overview / one list                               | `shopping-lists-client.tsx` / `shopping-list-client.tsx`            |
| Dialogs (list create/rename, item edit)                 | `shopping-list-dialog.tsx`, `shopping-item-dialog.tsx`              |
| Routes                                                  | `/groups/[groupId]/shopping`, `/groups/[groupId]/shopping/[listId]` |

## Data

```
groups/{groupId}/shoppingLists/{listId}              ShoppingList   (name, icon, createdBy, openCount, …)
groups/{groupId}/shoppingLists/{listId}/items/{id}   ShoppingItem   (name, quantity, forUid, checked, checkedBy, checkedChangedAt, product?)
groups/{groupId}/shoppingState/catalog               ShoppingCatalog (entries keyed by shoppingNameKey)
```

All three are member-readable, server-written ([[Firestore Rules]]). List and item ids are
**client-chosen** (`newClientMessageId`), which makes a retried create safe — the same trick as
the chat's `clientId` ([[Chat]]). Someone else's id answers `invalid-id`. `openCount` is recounted
with a `count()` query after every item change; display only (the group page's card).
`deleteGroup`'s `recursiveDelete` takes all of it along.

**Permissions:** any member, for everything — the lists move no money, so there is no manager
gate and no owner check (unlike expenses). `forUid` must be a key of `group.members`
(placeholders allowed: "für Oma"); `Object.hasOwn`, so `"constructor"` is no member.

## Ticking off — the offline exception (ADR-009)

The one write that works offline. A tap never calls the action directly:

1. `queueCheck` puts `{ checked, changedAt }` (the end state and the time of the tap) into a
   per-user outbox in `localStorage` (`split:shopping-checks:<uid>`) — it survives the app being
   closed in the shop.
2. The list shows the outbox over the listener (`effectiveChecked`), so the tick appears at once.
3. `flushPendingChecks` sends unsent entries one by one through `setShoppingItemChecked` (via
   `callAction`): right away when online, else on the `online` event — from
   `ShoppingCheckSync`, mounted in `(app)/layout.tsx`, so it also happens when the next thing
   opened is the group page. A `network` or `unauthenticated` answer stops the run (try again
   later); any other refusal (item or list deleted, not a member) drops the entry.
4. The server applies a tick only if `changedAt` is newer than the stored `checkedChangedAt`
   (a future time is clamped to now). A late tick from the basement loses to a newer one
   (`applied: false`); a repeat is harmless.
5. A sent entry stays until the listener shows it (`prunePendingChecks`), so the tick can't
   flicker back between the action's answer and the snapshot; unconfirmed sent entries are
   forgotten after 2 min.

While the outbox holds unsent ticks the list says "n Haken noch nicht gesendet – gehen raus,
sobald du wieder Netz hast" — an unsent tick never looks like a saved one. Sign-out wipes the
outbox with the rest of the device's data (`clearLocalData`, [[Offline Mode]]).

Everything else (add, edit, delete, rename, "Erledigte entfernen") is disabled offline as
usual, with the hint "Offline kannst du abhaken. Hinzufügen und Bearbeiten geht wieder mit Netz."

## Aisles and suggestions

Items are grouped by the [[Product Insights]] families in `PRODUCT_FAMILY_IDS` order (food
first, drugstore later — roughly a shop's walk), the unclassified last ("❔ Noch nicht
eingeordnet", a visible section). Checked items move to "Im Wagen (n)", most recent first.

Where an item's class comes from, in order: the suggestion it was picked from → the group's
**catalog** (every name ever put on a list, with its class once known) → a model after the
response (`classifyShoppingItemAfterResponse`, kind `classify-auto`, counted against the group's
[[AI Usage]]). So "Milch" costs one prompt ever, not one a week. The catalog is capped at 300
names (least recently added drop).

Suggestions ("Schnell hinzufügen", and an autocomplete while typing) = catalog names (weighted
×2) + the product kinds of the receipt lines of the last 80 expenses, groceries and household
families only — minus what's already open. A tap adds with the class attached.

## Layout

An ordinary scrolling page, **add field at the top**: nothing is parked at the bottom, so the
iOS keyboard can't cover it and no `useVisibleHeight` frame is needed ([[Mobile iOS Quirks]]).
Every text field goes through `ui/input` / `ui/select` (16px on phones). A whole row is the
tick target (`role="checkbox"`), the ⋯ menu holds edit/delete.

Offline/loading honesty as everywhere ([[Offline Mode]]): sync marks `<uid>:shopping:<groupId>`
and `<uid>:shopping:<groupId>:<listId>`, `NeedsConnection` without a copy, a visible error for a
failed listener; the suggestion listeners' failure shows next to the suggestions, never instead
of the list. The group page's card shows a skeleton (online) or "auf diesem Gerät noch nicht
geladen" (offline) for an empty cache, never "keine Liste".

Adds feel instant: a pending row ("Wird hinzugefügt …") until the listener has the id; a failed
add stays with "Erneut" (same id) / "Verwerfen".

## Testing

Unit: `shopping.test.ts`, `pending-checks.test.ts`; component: `shopping-list-client.test.tsx`
(aisles, offline tick + flush, `NeedsConnection`, pending and failed adds); emulator:
`shopping.emulator.test.ts` (retry-safe creates, permissions, newer-tap-wins, future clamp,
catalog, classification with a faked model); rules: the shopping block in
`firestore.rules.test.ts`. **Not** checked on a real iPhone.

## Related

[[Offline Mode]] · [[Product Insights]] · [[AI Usage]] · [[Data Model]] · [[Firestore Rules]] · [[Group Page]]
