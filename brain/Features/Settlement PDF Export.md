---
tags: [feature, pdf, sharing, public-route]
---

# Settlement PDF Export

Route: `src/app/share/settlement/[groupId]/[token]/route.ts`. Token minting:
`src/lib/actions/settlement-share.ts`. Rendering: `src/lib/pdf/settlement-pdf.tsx` (uses
`@react-pdf/renderer`).

## The only public, unauthenticated route in the app

Every other read in the app goes through `firestore.rules` membership gates or a session-
checked Server Action. This route is deliberately different: it needs **no session cookie and
no Firebase Auth** — the whole point is a link a group member can send to someone outside the
app (or without an account) so they can see who owes whom.

## The link _is_ the access control

`getOrCreateSettlementShareToken` (a normal, session-checked Server Action — only a group
member can _mint_ the link) generates a random token (`randomBytes(18).toString("base64url")`)
lazily, on first request, and stores it at `group.settlementShareToken`. The route handler
then checks `token === group.settlementShareToken` — **knowing the `groupId` alone is not
enough**, you need the token too. There's no expiry; treat the token as a capability, and
don't build anything that logs or exposes it outside the share flow.

**Rotation (2026-09):** owners and admins can "Link zurücksetzen" in the Salden tab's export
section — `rotateSettlementShareToken` writes a fresh token, so every link handed out so far
404s, and the next "Als PDF herunterladen" shares the new one. Managers only, because it
breaks the link for everyone the group already sent it to.

## No file is ever stored

The PDF is **regenerated from live Firestore data on every request**
(`Cache-Control: no-store`), not written to Firebase Storage and served as a static file.
This is consistent with the rest of the app avoiding Storage entirely (`storage.rules` is
still a deny-all placeholder — receipts were never built). Rebuilding on demand also means the
PDF is always current as of the moment it's opened, with no separate cache-invalidation
problem to solve.

## What it renders

Pulls all non-deleted expenses and all settlements, runs them through `computeBalances`,
`simplifyDebts`, and `computeMemberTotals` (see [[Money Invariants]]) — the exact same
functions the in-app UI uses, so the PDF and the live balance view can never numerically
disagree — then hands the results to `renderSettlementPdf` along with the group's members,
currency, and the request's own origin (for a `shareUrl` printed in the document). Locale is
read server-side via `getLocale()` (see [[i18n]]) so the PDF matches the group's language.

## Sibling: the CSV export

Next to the PDF sits "Als CSV exportieren" (`src/lib/export/group-csv.ts`). Unlike the PDF it
never touches the server: it's built in the browser from the ledger the group page already
has loaded, and it's for spreadsheets, not for sharing — every live expense and payment,
oldest first, one column per person holding that row's effect on their balance, and a "Saldo"
row whose per-person totals equal `computeBalances` (a departed member still in the ledger
keeps a column, or the columns wouldn't net to zero). Written for a German Excel: `;`
separator, decimal comma without thousands dots, UTF-8 BOM, CRLF. Text cells that start like a
formula (`=`, `+`, `-`, `@`) get a leading `'` — descriptions come from other members, and
Excel would otherwise execute them (CSV injection).

## Related

[[Balances and Settlements]] · [[Money Invariants]] · [[Data Access Pattern]] (this route is the one exception to "reads go through the client SDK")
