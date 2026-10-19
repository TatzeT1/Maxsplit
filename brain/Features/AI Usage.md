---
tags: [feature, ai, admin, quota]
---

# AI Usage (🤖 KI-Anfragen)

Every prompt the app sends to a model ([[Receipt Scan]], [[Product Insights]]) is **counted per
group and month, limited, and logged**. The app admin sees all of it and sets each group's
limit; a group's owner and admins see their own group's count and latest prompts, read only.

| Piece                                                  | Where                                            |
| ------------------------------------------------------ | ------------------------------------------------ |
| Default limit, month/day keys, free-tier budgets       | `src/lib/ai/limits.ts` (shared client/server)    |
| The meter: take + record, server-only                  | `src/lib/ai/usage.ts` (`groupAiMeter`)           |
| Where the meter is called                              | `askModels` / `scanReceiptImage` in `scan.ts`    |
| Admin read helpers                                     | `src/lib/admin/ai.ts`                            |
| Set a group's limit                                    | `adminSetGroupAiLimit` in `lib/actions/admin.ts` |
| Admin page (all groups, providers, latest 100 prompts) | `app/(app)/admin/ai/page.tsx`                    |
| Admin group page: limit form + the group's 50 latest   | `admin/groups/[groupId]` (`#ai`)                 |
| Managers' view in Einstellungen                        | `components/groups/ai-usage-panel.tsx`           |

## What counts

**One prompt = one count**, whatever the provider chain does with it: a scan whose Flash
attempt was overloaded and that Flash-Lite answered is still one prompt for the group. What
counts, in the group's month:

- 📷 a receipt scan (`receipt-scan`);
- 📊 each request of "Jetzt einordnen" — 60 texts per request, so a run of 120 texts is two
  (`classify`);
- 📊 the classification after saving an expense (`classify-auto`), caused by whoever saved.

The per-user daily limits (`receiptScans`, `productClassifyRuns`) stay as they were, on top.

## The limit

`Group.aiRequestLimit`: absent/null → `DEFAULT_GROUP_AI_LIMIT` (**50 per calendar month, UTC**),
a number → that, **0 → AI blocked**. Only `adminSetGroupAiLimit` writes it (0…10 000 or null);
always read it through `effectiveAiLimit`.

- `groupAiMeter.take()` counts the prompt in `groups/{id}/aiUsage/{yyyy-mm}` in a transaction
  that also reads the limit — **before** the model is asked, like the daily quotas. Refused →
  nothing is sent: the scan answers `ai-limit`, a classification batch stays unclassified
  (`ModelLimitError`, caught in `classifyEntries`).
- The actions check `aiAllowanceLeft` first, read only, so a blocked or spent group does not
  also use up the member's daily scans/runs.
- A new month is a new doc — no reset job. Months stay as history.

UI copy: `receipt.errorAiLimit`, `insights.classifyAiLimit`. The scan button is not hidden for
a blocked group (members can't read the count); the tap says why.

## The log

`groups/{id}/aiCalls/{auto}` — `AiCall` in `types.ts`: kind, uid, time, `answeredBy`, every
provider **attempt** (ok, ms, HTTP requests incl. retry, error) and a `summary`:

- classify: the texts sent (≤60, ≤120 chars each);
- scan: merchant + line names read. **Never the photo** — same promise as [[Receipt Scan]].

Kept 90 days: `expiresAt` + a Firestore **TTL policy** declared in `firestore.indexes.json`
(along with the collection-group index the admin page's "latest prompts" needs). Both only
exist once deployed: `pnpm exec firebase deploy --only firestore:indexes`.

A failed log write is logged and swallowed — it never fails the scan it describes.

## "Wie viele Credits habe ich noch?"

**Gemini has no API for remaining free-tier quota** (only the AI Studio quota page shows it), so
the admin page shows the app's **own count**: `aiProviderUsage/{yyyy-mm-dd}` (server-only),
`counts[provider]` = HTTP requests incl. retries, against `dailyRequestBudget` — the 2026-09
measurements (Flash ≈ 20/day, Flash-Lite ≈ 500/day, OpenRouter free 50/day). These are
estimates per Google Cloud project; other apps on the same project are invisible here.
OpenRouter does have `/api/v1/key` — deliberately not called (decision 2026-10-19: own counters
only).

## Who reads what (rules)

- `groups/{id}/aiUsage/*`, `groups/{id}/aiCalls/*` → read: `isGroupManager(groupId)` (owner or
  admin, rules helper mirroring `lib/groups/permissions.ts`); write: false.
- `aiProviderUsage/*` → read, write: false. The admin page reads with firebase-admin.

## Testing

- `src/lib/ai/limits.test.ts` — default/blocked/custom, validation, UTC month, budgets.
- `src/lib/receipt/scan.test.ts` ("the meter") — refused → nothing sent; attempts with retry
  counts; the photo never in the record.
- `receipts.emulator.test.ts`, `products.emulator.test.ts` — counting, logging, monthly limit,
  blocked group sparing the daily quota, `adminSetGroupAiLimit`.
- `firestore.rules.test.ts` ("AI usage") — managers read, members and strangers don't.

## Related

[[Receipt Scan]] · [[Product Insights]] · [[Admin Panel]] · [[Firestore Rules]] · [[Data Model]]
