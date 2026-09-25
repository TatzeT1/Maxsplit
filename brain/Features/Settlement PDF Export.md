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

## The link *is* the access control

`getOrCreateSettlementShareToken` (a normal, session-checked Server Action — only a group
member can *mint* the link) generates a random token (`randomBytes(18).toString("base64url")`)
lazily, on first request, and stores it at `group.settlementShareToken`. The route handler
then checks `token === group.settlementShareToken` — **knowing the `groupId` alone is not
enough**, you need the token too. There's no expiry and no rotation; treat the token as a
capability, and don't build anything that logs or exposes it outside the share flow.

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

## Related
[[Balances and Settlements]] · [[Money Invariants]] · [[Data Access Pattern]] (this route is the one exception to "reads go through the client SDK")
