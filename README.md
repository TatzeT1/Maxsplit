# Split

A self-hosted, free alternative to Splitwise — a shared-expense tracker for groups (flatmates,
couples, trips). German UI, no paywalls.

## Stack

Next.js (App Router, TypeScript strict) + Tailwind + shadcn/ui, Firebase (Auth, Firestore,
Storage), pnpm, Vercel. See [docs/DECISIONS.md](docs/DECISIONS.md) for the architecture
rationale (ADR-001: hybrid client reads / server-validated writes).

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- Java 11+ (required by the Firestore/Storage emulators — check with `java -version`)

## Getting started (local dev, under 5 minutes)

```bash
pnpm install
cp .env.example .env.local
```

Edit `.env.local`:
- Set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`.
- Add these three lines so the Admin SDK also talks to the local emulators instead of
  production Firebase:
  ```
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
  FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
  ```
- The `NEXT_PUBLIC_FIREBASE_*` client values and `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64` can be
  left as placeholders for emulator-only development — the emulators don't validate them. Real
  values are only required to run against the actual Firebase project (see below).

Then, in two terminals:

```bash
pnpm emulators   # Firebase Auth + Firestore + Storage emulators, UI at http://localhost:4000
pnpm dev         # Next.js dev server at http://localhost:3000
```

Sign in with "Mit Google anmelden" — the Auth emulator shows a fake account picker, no real
Google account needed.

## Running against the real Firebase project

1. Fill in the `NEXT_PUBLIC_FIREBASE_*` values from Firebase Console → Project settings →
   Your apps → web app → `firebaseConfig`.
2. Generate a service account key (Project settings → Service accounts → Generate new private
   key), base64-encode the JSON file, and set `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`.
3. Set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false` and remove/comment out the three
   `*_EMULATOR_HOST` lines.
4. Deploy Firestore/Storage rules: `pnpm exec firebase deploy --only firestore:rules,storage`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm format` / `format:check` | Prettier |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:rules` | Firestore security rules tests against the emulator |
| `pnpm emulators` | Firebase Auth/Firestore/Storage emulator suite |

## Project structure

- `src/lib/i18n/de.ts` — the single German string dictionary; every UI string goes through
  `t()` from here, no hardcoded text in components.
- `src/lib/money/` — split calculation (largest-remainder rounding) and balance math. This is
  the only place money invariants are computed; see the tests for the guarantees enforced.
- `src/lib/firebase/` — `client.ts` (browser SDK, realtime reads) and `admin.ts` (Admin SDK,
  server-only, used by Server Actions/Route Handlers for writes) — see ADR-001.
- `src/lib/auth/session.ts` — server-side session cookie verification.
- `firestore.rules` / `storage.rules` — deny-by-default; membership-gated reads, all writes
  denied (writes go through the Admin SDK, which bypasses rules).
- `docs/DECISIONS.md` — architecture decision records (ADR format).
