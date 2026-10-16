---
tags: [feature, expenses, receipts, ai]
---

# Receipt Scan (📷 Beleg)

Photograph a restaurant bill, a free vision model reads its line items, and you tap who had
which unit — "3 Cola, 4 Spätzle, the last one shared" — instead of working out the amounts
yourself. The result is an ordinary `exact` split, plus the items stored on the expense so the
detail view can show who had what.

| Piece                                                 | Where                                        |
| ----------------------------------------------------- | -------------------------------------------- |
| Allocation, validation, limits (shared client/server) | `src/lib/receipt/receipt.ts`                 |
| Model answer → line items (tolerant parser), prompt   | `src/lib/receipt/parse.ts`                   |
| Provider chain (Gemini → OpenRouter), server-only     | `src/lib/receipt/scan.ts`                    |
| Photo → JPEG data URL under 1 MB (client)             | `src/lib/receipt/prepare-image.ts`           |
| `scanReceipt` Server Action, daily quota              | `src/lib/actions/receipts.ts`                |
| Booking with items                                    | `addExpense`/`editExpense` (`receipt` field) |
| Editor ("Wer hatte was?")                             | `components/groups/receipt-split-dialog.tsx` |
| Entry points in the form                              | `add-expense-dialog.tsx`                     |
| "Positionen" in the detail view                       | `expense-detail-dialog.tsx`                  |

## Flow

1. **Beleg scannen** (only shown when a key is configured — `isReceiptScanConfigured()` is read
   by the group page's Server Component and passed down via `ReceiptScanProvider`) opens the
   phone's camera or photo library (a plain `<input type="file" accept="image/*">`, no
   `capture` — so both are offered; this is not `getUserMedia`, so the
   `Permissions-Policy: camera=()` header doesn't block it).
2. `prepareReceiptImage` scales the photo to ≤ 1600 px JPEG (stepping down until it fits
   `MAX_RECEIPT_IMAGE_CHARS`) — Server Actions refuse bodies over 1 MB, and a phone photo is
   several MB. EXIF rotation is applied by `createImageBitmap`.
3. `scanReceipt` — session, membership, image shape, quota — then `scanReceiptImage`. Nothing
   is stored: not the photo, not the items.
4. The editor opens with the items. Every line can be corrected, removed or added (the whole
   editor also works without any scan: **Positionen eintippen**). Each **unit** gets its own row
   of member toggles; several people on one unit share it equally. "Alle" (3+ members) and
   "Alle Einheiten wie die erste" are shortcuts.
5. **Übernehmen** fills the form: amount = receipt total, `exact` inputs from
   `allocateReceipt`, description = merchant (if empty), date = receipt date (add mode only).
6. Save → `addExpense` with `receipt`.

## The money: `allocateReceipt`

Line total → units (`splitEqual`, odd cents to the first units) → each unit among its sharers
(`splitEqual`) → per-person subtotals. The difference to the booked amount (tip if positive,
discount if negative) is spread **in proportion to the subtotals** with
`distributeByWeights`. Every step is largest-remainder, so the result sums to the amount
exactly ([[Money Invariants]]). A discount `≥` the items total throws (nothing fair to split);
nobody can go below zero.

## Server checks (`resolveReceipt` in `expenses.ts`)

A sent receipt must pass `validateReceipt` (every field, members only — own keys, so
`"constructor"` is no member), the split must be `exact` and not a game's (`viaLottery`), and
the booked amounts must equal `allocateReceipt(amountMinor, items)` exactly — otherwise
`invalid-split`. The stored items are what the detail view shows; they may never tell a
different story than the booked split. `normalizeReceipt` stores exactly the known fields.

In the form, picking a split mode or typing an exact amount by hand drops the receipt
(`receipt: null` on edit — "absent vs null" like `game`); changing the amount re-spreads it.

## Providers and keys

Tried in order; a failure (HTTP error, timeout of 30 s, prose instead of JSON) falls through
to the next, and an answer with no items is tried on the next provider too:

| Env var              | Default               | Notes                                                                                                          |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`     | —                     | Google AI Studio key (free tier). Sent as `x-goog-api-key` header, never in the URL.                           |
| `GEMINI_MODEL`       | `gemini-flash-latest` | Alias Google moves to each new Flash. Pin a model id here if the alias ever misbehaves.                        |
| `OPENROUTER_API_KEY` | —                     | openrouter.ai key. Free models: 20 req/min, 50/day (1000/day after a one-off 10 $ top-up).                     |
| `OPENROUTER_MODELS`  | `openrouter/free`     | Comma list → OpenRouter's own `models` fallback. `openrouter/free` routes to a free model that can see images. |

None set → the scan button is hidden and `scanReceipt` answers `scan-unavailable`.

Free quotas are **per key**, shared by every user, so `receiptScans/{uid}` (`{ day, count }`,
server-only, rules deny all) caps each user at `RECEIPT_SCANS_PER_DAY` (25, UTC day), counted
before the model is asked.

Error codes → UI copy: `invalid-image`, `scan-unavailable`, `scan-limit`, `scan-failed`; an
empty read is a success with `items: []`, shown as "keine Positionen erkannt". All go through
`callAction`, so a thrown call is a visible error, not an endless "wird gelesen" ([[Offline Mode]]).

## Testing

- `src/lib/receipt/{receipt,parse,scan}.test.ts` — allocation (incl. a randomized
  sums-exactly sweep), validation, the tolerant parser, the provider chain with a fake `fetch`.
- `components/groups/receipt-split-dialog.test.tsx` — assigning, sharing, tip, corrections.
- `src/lib/actions/receipts.emulator.test.ts` — booking with items, mismatch/malformed
  refusals, scan auth/image/quota (the model endpoint faked, emulator traffic real).
- End-to-end without a real key: run `next dev` against the emulators with
  `NODE_OPTIONS=--require <preload>` where the preload wraps `globalThis.fetch` and answers
  only `generativelanguage.googleapis.com` — never add such a hook to the app itself.

## Related

[[Expenses and Splitting]] · [[Money Invariants]] · [[Environment and Config]] · [[Data Model]]
