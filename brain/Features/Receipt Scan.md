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
| Provider chain (Gemini → OpenRouter), server-only     | `src/lib/receipt/scan.ts` (`askModels` too)  |
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
4. The editor opens with the items, **every unit shared by everyone** (a flat's shopping is
   bookable as is; only the exceptions need taps). While a unit is shared by everyone, tapping a
   name means "only this person" (`nextSelection`); further taps add and remove, "Alle" restores
   everyone. A line with several units shows one row for all of them until **Stückweise
   aufteilen**; **Alle Stück gleich aufteilen** folds it back (every unit takes the first one's
   people). Then: Every line can be corrected, removed or added (the whole
   editor also works without any scan: **Positionen eintippen**). Each **unit** gets its own row
   of member toggles; several people on one unit share it equally. "Alle" (3+ members) and
   "Alle Einheiten wie die erste" are shortcuts.
5. **Übernehmen** fills the form: amount = receipt total, `exact` inputs from
   `allocateReceipt`, description = merchant (if empty), date = receipt date (add mode only).
6. Save → `addExpense` with `receipt`.

Each line also carries what it **is** — `product: { family, kind }` ("🥩 Mett"), read by the same
request (the prompt lists the fixed families and asks for a generic German kind). The editor
shows it as a chip under the name; tapping it opens Obergruppe + Produktart to correct it. A
line without one (typed by hand, or an unusable answer) says "Wird nach dem Speichern
eingeordnet" and is classified after the response. See [[Product Insights]].

## The wait: `ReceiptScanOverlay`

A model gives no progress, so the wait is staged (`receipt-scan-overlay.tsx`): the photo
printed on a till slip (`.receipt-edges` + `.paper-tokens`), viewfinder corners breathing, a
scanner beam (`animate-scan-sweep`, globals.css) sweeping down and back, lines glinting as if
read (`animate-scan-glint`), and a status line moving on every 1,6 s ("Positionen suchen …",
"Preise lesen …"). After 9 s it says why ("die KI ist gerade gut beschäftigt" — retries and the
Flash-Lite fallback take time). On success an `InkStamp` ("2 erkannt", success ink) lands on
the slip and the editor opens 1,1 s later. **Abbrechen** bumps a run id, so a late answer is
ignored. Reduced motion: no beam or glints; the status line still changes.

## The money: `allocateReceipt`

Each line is split by how much of it each person had — a unit counts 1/n for each of its n
sharers, as integer weights over the lcm of the n's — and **rounded once per line** with
`distributeByWeights`. (Until 2026-10-16 it rounded unit by unit, which handed every unit's odd
cent to the same people: 6 yoghurts at 0,50 for three came out 102/102/96. The edit form
recomputes a stored receipt's split from its items, so one booked before the change still
saves.) The difference to the booked amount (tip if positive,
discount if negative) is spread **in proportion to the subtotals** with
`distributeByWeights`. Every step is largest-remainder, so the result sums to the amount
exactly ([[Money Invariants]]). A booked amount not on the items' side of zero (a discount
`≥` the items total) throws (nothing fair to split); a discount never takes anyone across zero.

**Negative lines (Pfand).** A line may be negative — a deposit return credits whoever it is
assigned to, and can leave that person with a negative share on a bill the others pay (the tip
or discount is spread only over people on the bill's side). A receipt of only negative lines (a
Leergutbon) is a **credit**: negative total, everyone's share negative, and applying it flips
the expense form to "Gutschrift". The scan prompt asks for deposit returns as negative items
(family `fees`, kind `Pfand`), `toMinor` reads a trailing minus ("0,25-"), and the editor has a
per-line **Pfand** toggle (no minus key on the iPhone keypad); its total field holds the amount
without sign and takes the items' direction.

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
to the next, and an answer with no items is tried on the next provider too. An overload or
rate-limit answer (429/5xx) is retried once after 1,5 s first — on 2026-10-16 production's
first real scans failed on two `503 "experiencing high demand"` from `gemini-flash-latest`
with no fallback configured, which is why Flash-Lite is now in the default chain:

| Env var              | Default                                        | Notes                                                                                                          |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`     | —                                              | Google AI Studio key (free tier). Sent as `x-goog-api-key` header, never in the URL.                           |
| `GEMINI_MODEL`       | `gemini-flash-latest,gemini-flash-lite-latest` | Comma list, tried in order. Flash is often overloaded (503) on the free tier; Flash-Lite has its own capacity. |
| `OPENROUTER_API_KEY` | —                                              | openrouter.ai key. Free models: 20 req/min, 50/day (1000/day after a one-off 10 $ top-up).                     |
| `OPENROUTER_MODELS`  | `openrouter/free`                              | Comma list → OpenRouter's own `models` fallback. `openrouter/free` routes to a free model that can see images. |

None set → the scan button is hidden and `scanReceipt` answers `scan-unavailable`.

Free quotas are **per key**, shared by every user, so `receiptScans/{uid}` (`{ day, count }`,
server-only, rules deny all) caps each user at `RECEIPT_SCANS_PER_DAY` (25, UTC day), counted
before the model is asked. On top, every scan counts against the group's monthly AI allowance
(default 50, admin-set, 0 = blocked → `ai-limit`) and is logged without the photo — see
[[AI Usage]].

### How far the free tier goes

Google no longer publishes free-tier numbers (only the AI Studio quota page shows them).
Measured in 2026-09 by third parties: Flash ≈ 20 requests/day and 5/min, Flash-Lite ≈ 500/day
and 15/min, per Google Cloud project (not per key). A spent daily quota (429 with a
`…PerDay…` quotaId) is not retried; the chain moves straight to the next model. So a group of
friends realistically gets ~20 scans on Flash plus ~500 on Flash-Lite a day — the per-user cap
(25) keeps one person from using it all.

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

[[Product Insights]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Environment and Config]] · [[Data Model]]
