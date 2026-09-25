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
returns 401. This is the *only* write path in the codebase authorized by a shared secret
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
subsequent daily invocations.

## Materialized expenses skip validation that already happened

`materializeDueRecurringRules` builds an `Expense` directly from the rule's stored template
(`paidBy`, `splitMode`, `splits` are copied as-is) — it does **not** re-run
`buildSplits`/`validatePaidBy` the way `addExpense` does, because the rule's template was
already validated when the rule itself was created (see `src/lib/actions/recurring.ts`). If
you change what recurring rules can store, make sure creation-time validation still guarantees
the invariants in [[Money Invariants]] hold for every future materialized expense.

## Related
[[Money Invariants]] · [[Expenses and Splitting]] · [[Environment and Config]] (CRON_SECRET) · [[Deployment and Production Debugging]]
