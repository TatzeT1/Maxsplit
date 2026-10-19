---
tags: [feature, expenses, receipts, ai, analytics]
---

# Product Insights (📊 Auswertung)

"Wir haben diesen Monat 50 € für Mett ausgegeben": every receipt line and every expense gets a
**ProductClass** — a fixed _family_ (Obergruppe, "Fleisch & Wurst") and a free, normalized
_kind_ (Produktart, "Mett") — and the Auswertung tab sums them per month, year or overall, for
the whole group or one person's share.

| Piece                                                 | Where                                               |
| ----------------------------------------------------- | --------------------------------------------------- |
| Families, emoji, validation, `missingProductClasses`  | `src/lib/products/products.ts`                      |
| Text classification prompt + parser (batched), server | `src/lib/products/classify.ts`                      |
| Classify stored expenses, conditional writes, server  | `src/lib/products/classify-expenses.ts`             |
| After-response hook (`after`) for add/edit            | `src/lib/products/classify-after.ts`                |
| "Jetzt einordnen", member correction                  | `src/lib/actions/products.ts`                       |
| Totals by family/kind/person, periods                 | `src/lib/products/totals.ts`                        |
| Per-line, per-person amounts of a receipt             | `receiptLineShares` in `src/lib/receipt/receipt.ts` |
| Tab                                                   | `components/groups/insights-tab.tsx`                |
| Chip + fields (editor, detail dialog)                 | `components/groups/product-class-fields.tsx`        |

## Who classifies what, and when

- **Scanned receipt lines** — the scan's own request (`RECEIPT_PROMPT` asks for `family` and
  `kind` per item). No extra request.
- **Everything else** — an expense without a receipt (by its description, the category as a
  hint) and receipt lines without a class — is classified **after the response**
  (`classifyAfterResponse`, next/server's `after`, like pushes): saving never waits for a model
  or fails because of one. `editExpense` keeps the class while the description stays the same
  (also a hand-corrected one) and deletes it otherwise.
- **Catch-up** — expenses from before 2026-10, games, recurring rules and anything the model
  failed on stay unclassified ("❔ Noch nicht eingeordnet", a visible row that counts in the
  total). **Jetzt einordnen** runs `classifyGroupExpenses`: newest first, ≤120 texts per step
  (two requests of `CLASSIFY_BATCH_SIZE` = 60, one text asked once however many expenses carry
  it), and the client repeats while `remaining > 0` and a step made progress (≤8 steps).
  `productClassifyRuns/{uid}` caps a user at `CLASSIFY_RUNS_PER_DAY` (20) — the free quota is
  per key, shared by everyone, same as [[Receipt Scan]]'s. Hidden without a model key. Every
  request (manual or after saving) also counts against the group's monthly AI allowance —
  [[AI Usage]]; once spent, nothing is asked and the expenses stay unclassified.
- **Corrections** — a receipt line in the receipt editor (books through `editExpense`); an
  expense without a receipt in the detail dialog's "📊 Einordnung" (`setExpenseProduct`,
  **any member** — it moves no money).

Every server write is conditional on the expense's `lastUpdateTime`: an edit that lands between
the read and the model's answer wins, and what it leaves unclassified is picked up next time.

`kind` is stored normalized (`normalizeProductKind`: whitespace collapsed, first letter upper
case, ≤40 chars) and summed case-insensitively, so "mett" and "Mett" are one row. It is German
whatever the UI language — one spelling per product is what makes the table add up.

## The numbers

`computeProductTotals(expenses, period, uid | null)`:

- A receipt counts **by its lines**: `receiptLineShares` spreads each person's booked amount
  (tip/discount included) over their lines in proportion to what they had — so per person it is
  exactly their split, and all lines add up to the expense amount (largest remainder,
  [[Money Invariants]]). A receipt that no longer allocates falls back to the expense's split.
- Any other expense counts whole, per person by its `splits`.
- The group view shows, under each kind, who had how much ("Anna 3,20 € · Ben 1,10 €"); a
  person's view ("Ich", or any member) counts only their share. Settlements never count.
- Periods compare the `yyyy-mm-dd` date's prefix; month and year step with ‹ ›.

## UI notes

Five tabs now share the bar: triggers on the group page are `flex-auto` (as wide as their label)
with smaller padding/type below 375 px — measured, "Auswertung" needs ~75 px and a fifth of a
375 px bar is 65. Family names wrap rather than truncate in the table.

## Testing

- `src/lib/products/{products,classify,totals}.test.ts`, `receiptLineShares` in
  `src/lib/receipt/receipt.test.ts`, the product in `parse.test.ts`.
- `components/groups/insights-tab.test.tsx`, product chip in `receipt-split-dialog.test.tsx`.
- `src/lib/actions/products.emulator.test.ts` — scheduling after add/edit
  (`src/test/classify-mock.ts` stands in for the `after` hook), conditional writes, catch-up,
  quota, corrections.

## Related

[[Receipt Scan]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Data Model]]
