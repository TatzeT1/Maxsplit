# Claude Code Kickoff Prompt — Splitwise-Style Expense Sharing App

> Copy everything below the line into Claude Code as your first message.
> Replace `{{APP_NAME}}`, `{{GITHUB_USER}}` and `{{FIREBASE_PROJECT_ID}}` first.

---

## Role & Mission

You are the lead engineer on a greenfield web app. We are building a self-hosted, free
alternative to Splitwise — a shared-expense tracker for groups (flatmates, couples, trips).
No paywalls, no feature gating, no ads.

Work autonomously but **stop and ask me** whenever a decision is irreversible (data model
changes after data exists, choice of paid service, anything touching billing).

**Working agreement:**
- Plan first, code second. Show me the plan and wait for my "go" before Phase 1 implementation.
- Small, reviewable commits with Conventional Commits (`feat:`, `fix:`, `chore:`).
- Never commit secrets. `.env.local` stays gitignored; `.env.example` is committed.
- After every phase: run `npm run build`, `npm run lint`, and the test suite. Nothing merges red.
- Keep a running `docs/DECISIONS.md` (ADR format: Context → Decision → Consequences).

---

## Fixed Constraints (do not change without asking)

| Area | Decision |
|---|---|
| Framework | Next.js (latest stable, App Router) + TypeScript strict mode |
| Styling | Tailwind CSS + shadcn/ui, dark mode by default with light toggle |
| Auth | Firebase Authentication — **Google sign-in only** for v1 |
| Database | Cloud Firestore |
| File storage | Firebase Storage (receipt images) |
| Hosting | Vercel, auto-deploy from GitHub `main` |
| Repo | GitHub, repo name `{{APP_NAME}}`, owner `{{GITHUB_USER}}` |
| Package manager | pnpm |
| UI language | **German only (de-DE)**. Every user-facing string is German. |

### German UI rules
- Address the user with **"du"**, not "Sie". Tone: friendly, short, no corporate speak.
- Correct German formatting throughout: `1.234,56 €`, dates as `12.08.2026`, weekdays `Mo–So`.
- Use `Intl.NumberFormat('de-DE')` / `Intl.DateTimeFormat('de-DE')`, never hand-rolled formatting.
- Put **all strings in a single `src/lib/i18n/de.ts` dictionary** exported as a typed const object,
  accessed via a `t()` helper. No hardcoded strings in components. This costs almost nothing now
  and means adding English later is a new file, not a refactor.
- Code, comments, variable names, commit messages, and docs stay **English**.

---

## Architecture Decision I'm Delegating to You

Choose between:

- **(A)** Firebase client SDK directly from React components, security enforced purely by
  Firestore Security Rules. Gives realtime listeners for free.
- **(B)** Next.js Server Actions / Route Handlers using the Firebase Admin SDK, with a session
  cookie minted from the ID token. Rules become a deny-all backstop.
- **(C)** A hybrid: reads via client SDK (realtime), writes via Server Actions (validated).

Evaluate these against: correctness of money math, cost (Firestore reads), realtime UX,
Vercel cold starts, and testability. **Write the choice up in `docs/DECISIONS.md` as ADR-001
before writing application code**, including what would make you reverse it.

Whichever you pick, these are non-negotiable:
- Firestore Security Rules must be written, tested with the emulator, and deny by default.
- A user may only read/write groups where their UID is in the members map.
- Balance/settlement math is **never** computed on the client as source of truth.

---

## Data Model (starting point — improve it and tell me why)

Money is **always stored as integer minor units** (cents) plus an ISO-4217 currency code.
Never floats. Never store a formatted string.

```
users/{uid}
  displayName, email, photoURL, defaultCurrency, createdAt

groups/{groupId}
  name, iconEmoji, currency (group default), createdBy, createdAt, archived
  memberUids: [uid]              // for security rules + queries
  members: { [uid]: { displayName, photoURL, joinedAt, role } }
  inviteCode                     // short code for joining

groups/{groupId}/expenses/{expenseId}
  description, amountMinor, currency, fxRateToGroupCurrency, date,
  category, paidBy: { [uid]: amountMinor },        // supports multiple payers
  splitMode: 'equal' | 'shares' | 'percent' | 'exact',
  splits: { [uid]: { rawValue, amountMinor } },    // resolved amounts always present
  receiptPath, createdBy, createdAt, updatedAt, deletedAt

groups/{groupId}/settlements/{settlementId}
  fromUid, toUid, amountMinor, currency, date, note, createdAt

groups/{groupId}/recurring/{ruleId}
  template (same shape as expense), rrule, nextRunAt, lastRunAt, active
```

**Money invariants to enforce in code and cover with tests:**
1. `sum(paidBy) === amountMinor` exactly.
2. `sum(splits[*].amountMinor) === amountMinor` exactly — the remainder from rounding is
   distributed deterministically (largest-remainder method), never silently dropped.
3. Across a group, `sum(all member balances) === 0`.

---

## Phased Roadmap

You listed everything as in-scope, which is too much for one pass. Ship in this order;
each phase must be deployed and usable before the next starts.

### Phase 0 — Foundations
- `create-next-app` (TS, App Router, Tailwind), shadcn/ui init, ESLint + Prettier, Vitest.
- Firebase project wiring, `.env.example`, Firebase emulator suite for local dev.
- GitHub repo, push, connect to Vercel, verify a preview deploy is green.
- Google sign-in working end to end, protected route group, sign-out.

### Phase 1 — Core (the actual MVP)
- Create/join groups via invite code. Member list.
- Add/edit/delete expense with **equal splits**.
- Balance view ("Du schuldest Anna 12,50 €" / "Anna schuldet dir 8,00 €").
- Record a settlement. Activity feed.

### Phase 2 — Split flexibility
- `shares`, `percent`, and `exact` split modes with a clean German UI for each.
- Multiple payers on one expense.
- Categories with icons; filter and search.

### Phase 3 — Debt simplification & multi-currency
- Minimum-cash-flow debt simplification ("Schulden vereinfachen"), as an **opt-in toggle per
  group**, showing the before/after so nobody is surprised.
- Per-expense currency with the FX rate frozen at entry time (rate stored on the expense, so
  history never retroactively changes). Use a free FX API; cache daily in Firestore.

### Phase 4 — Receipts & recurring
- Receipt upload to Firebase Storage, thumbnail, lightbox, Storage rules scoped to group members.
- Recurring expenses via a Vercel Cron route handler hitting a protected endpoint.

### Phase 5 — Polish
- PWA: manifest, installable, offline read via Firestore persistence.
- Export a group to CSV.
- Empty states, loading skeletons, optimistic updates, error toasts — all in German.

---

## Deployment Pipeline

1. GitHub repo with `main` protected; feature branches → PR → preview deploy.
2. Vercel project linked to the repo. Env vars set for Production **and** Preview.
3. `NEXT_PUBLIC_FIREBASE_*` client vars; any Admin SDK service-account key as a
   **non-public** env var, base64-encoded, never in the repo.
4. GitHub Actions: typecheck + lint + test on every PR.

**Known gotcha to handle up front:** Firebase Auth only allows sign-in from domains listed
under Authentication → Settings → Authorized domains. Vercel preview URLs are randomly
generated per deploy and will break Google sign-in. Solve it deliberately — e.g. a stable
preview alias domain added to the authorized list — and document the approach in
`docs/DEPLOYMENT.md` alongside the exact Firebase console steps I need to click.

---

## Definition of Done for Each Phase

- Typecheck, lint, unit tests green; build succeeds.
- Firestore rules tested against the emulator, including negative cases (non-member denied).
- Money-math tests: rounding remainders, 3-way splits of odd amounts, multi-payer, zero-sum.
- Works on a 375px viewport — mobile is the primary surface for this app.
- Deployed to Vercel and manually verified.
- `README.md` updated so a fresh clone can run locally in under five minutes.

---

## Start Here

1. Confirm you've understood the constraints; flag anything you disagree with.
2. Ask me for: `{{FIREBASE_PROJECT_ID}}`, the repo name, and my Firebase web config.
3. Write ADR-001 (the architecture choice above) and a Phase 0 task breakdown.
4. Wait for my approval, then execute Phase 0.