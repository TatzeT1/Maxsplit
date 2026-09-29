---
tags: [feature, recurring, cron]
---

# Recurring Expenses

Schedule math: `src/lib/recurring/schedule.ts`. Materialization: `src/lib/recurring/materialize.ts`.
Cron entry point: `src/app/api/cron/recurring/route.ts`. Server Actions (rule CRUD):
`src/lib/actions/recurring.ts`. Schedule config: `vercel.json` (`0 6 * * *`, daily).

## Not a Server Action flow — the one exception

Every other write path in this app checks a user's session (see [[Data Access Pattern]]).
Materialization is different: it's triggered by **Vercel Cron**, which has no user session at
all. The route handler instead checks a shared secret:

```
Authorization: Bearer $CRON_SECRET
```

Vercel automatically sends this header when invoking a configured cron job if `CRON_SECRET`
is set as an env var — see [[Environment and Config]]. If the header doesn't match, the route
returns 401. This is the _only_ write path in the codebase authorized by a shared secret
instead of `getSession()`.

## `addPeriod` — advancing the schedule

`weekly` just adds 7 days. `monthly` is the interesting case: it targets the **anchor
day-of-month from the rule's original `startDate`**, clamped to the target month's length
(Jan 31 → Feb 28), and **re-expands** once a month is long enough again (Feb 28 → Mar 31 for a
rule anchored on the 31st). Anchoring to `startDate` rather than advancing from the previous
`nextRunDate` is deliberate — advancing from the previous date would permanently drift the
day downward after the first short month it hits (Jan 31 → Feb 28 → Mar 28, never recovering
to the 31st). All date math is done in UTC via `Date.UTC(...)` to avoid local-timezone
off-by-one issues.

## Catch-up, bounded

`materializeDueRecurringRules(today)` loops every active rule in every group: while
`nextRunDate <= today`, materialize an expense and advance, up to `MAX_CATCH_UP_RUNS = 24`
periods per rule per invocation. This bound exists so a cron outage (Vercel incident, a
deploy that broke the route) can't produce an unbounded backlog of expenses once it resumes —
worst case is 24 periods materialized per rule per run, and the remainder catches up on
subsequent daily invocations. `today` is `utcToday()` (`schedule.ts`) — the UTC calendar day,
shared with "resume" below so both agree on which periods are past.

## One period, one booking — even when runs overlap

Each period is booked by `bookNextPeriod` in **one Firestore transaction**: read the rule,
create the expense, advance `nextRunDate` — all or nothing. The expense id is derived, not
random: `recurringExpenseId(ruleId, date)` = `rec_{ruleId}_{yyyy-mm-dd}`. Together that means
a run that dies half-way, a retried invocation, or two overlapping runs can never book the
same period twice, and a booking someone soft-deleted stays deleted (its doc still exists, so
the period counts as booked). Before 2026-09 the add and the advance were separate writes, so
a timeout between them re-booked the period the next day.

## Keeps the balance cache fresh

Every group that got a new expense has `recomputeGroupBalances` run afterwards — the same
thing every Server Action does after a ledger write (see [[Money Invariants]]). The cron used
to skip it, so the groups list's "du schuldest …" went stale after every booking until
someone's next manual edit.

## Never books a rule that names a non-member ("ghost debt")

A rule's template names members (`paidBy`, `splits`) and is booked as-is for months. If one of
those uids is no longer in `group.members`, the booked expense gives them a balance the group
page never shows — it only names debts for `Object.keys(members)` (see [[Groups and
Members]]). `src/lib/recurring/rule-members.ts` holds the checks; three places use them:

- **Claiming a placeholder** rewrites recurring rules along with expenses and settlements.
- **Leaving / removing** a member is refused (`"in-recurring-rule"`) while any rule — active
  _or paused_, since a paused one can be resumed — still names them.
- **The cron** pauses (`active: false`) instead of booking a rule that names a non-member,
  e.g. one left behind before the two checks above existed; it then reads "Pausiert".
  Resuming such a rule is refused (`"rule-member-missing"`) — delete it and create it anew.

## Pause means skip, not defer

`setRecurringRuleActive({ active: true })` moves `nextRunDate` to `firstRunOnOrAfter(...)` —
the first date on the rule's own cadence that is today or later. Without it, resuming a rule
paused in June made the next cron run book June through September at once. Pausing leaves
`nextRunDate` untouched.

## Materialized expenses skip validation that already happened

`materializeDueRecurringRules` builds an `Expense` directly from the rule's stored template
(`paidBy`, `splitMode`, `splits` are copied as-is) — it does **not** re-run
`buildSplits`/`validatePaidBy` the way `addExpense` does, because the rule's template was
already validated when the rule itself was created (see `src/lib/actions/recurring.ts`). If
you change what recurring rules can store, make sure creation-time validation still guarantees
the invariants in [[Money Invariants]] hold for every future materialized expense.

## Related

[[Money Invariants]] · [[Expenses and Splitting]] · [[Environment and Config]] (CRON_SECRET) · [[Deployment and Production Debugging]]
