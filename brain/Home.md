---
tags: [moc, index]
---

# 🧠 Split — Project Brain

This is an [Obsidian](https://obsidian.md)-style linked knowledge base for **Split** (package
name `split-app`), a self-hosted, free Splitwise alternative. It exists so a coding agent
(or a human) landing in this repo cold can build an accurate mental model fast, without
re-deriving it from scratch by reading every file.

> [!info] Relationship to AGENTS.md / CLAUDE.md
> `AGENTS.md` (repo root) is the **binding working agreement** — Definition of Done, the
> two-auth-states warning, the mobile iOS rules, the `NEXT_PUBLIC_*` gotcha. It is short and
> load-bearing; read it first, every session, it's `@import`ed by `CLAUDE.md`.
> This vault is the **expanded reference** underneath it: more surface area, more "why",
> more links between concepts. When the two disagree, `AGENTS.md` wins — update this vault
> to match, don't silently fork the story.

## Start here

1. Read `AGENTS.md` (repo root) — the working agreement, non-negotiable.
2. Read [[Data Access Pattern]] — the one architectural decision everything else follows from.
3. Skim [[Data Model]] — the Firestore shape every feature reads and writes.
4. Then dive into whichever [[#Features]] note matches the task.

## Map of Content

### Architecture — the load-bearing decisions
- [[Data Access Pattern]] — ADR-001: client reads / server writes, and why
- [[Two Auth States]] — the bug class that has burned a full debugging session
- [[Data Model]] — Firestore collections, documents, and field-level gotchas
- [[Firestore Rules]] — deny-by-default, membership gates, the ban backstop
- [[Money Invariants]] — largest-remainder splitting, zero-sum balances

### Features — what the app does, and where
- [[Groups and Members]] — creation, invite codes, roles, placeholder members
- [[Expenses and Splitting]] — the four split modes, multi-payer, validation
- [[Balances and Settlements]] — net balances, pairwise debts, debt simplification
- [[Settlement PDF Export]] — the public, tokenized, on-demand PDF link
- [[Recurring Expenses]] — cron-driven materialization with catch-up
- [[Chat]] — per-group text chat and read receipts
- [[Split Lottery]] — the 🎲 gamified split picker
- [[Admin Panel]] — the single hardcoded admin email, ban, group moderation
- [[Onboarding and Payment Details]] — first-run guide, PayPal/IBAN details

### Frontend — how the UI is built
- [[i18n]] — the single German dictionary, `t()`, and why English exists too
- [[Mobile iOS Quirks]] — the two rules that only show up on a real iPhone
- [[Design System and Theming]] — fonts, dark mode, shadcn/ui, motion
- [[Routing Map]] — the App Router tree and what guards each segment

### Ops — running, testing, shipping
- [[Environment and Config]] — every env var, the emulator switch, build-time inlining
- [[Local Development and Testing]] — pnpm scripts, emulators, Vitest layout
- [[Deployment and Production Debugging]] — Vercel, cron, headers, how to debug prod

### Reference
- [[Conventions]] — code style, commit style, patterns repeated across the codebase
- [[Glossary]] — German UI terms, domain vocabulary, abbreviations used in code

## The one-paragraph mental model

Next.js App Router app, TypeScript strict, German-only UI (`de` is the default and only
fully-supported locale; `en` exists structurally but is not the product). Firebase Auth
(Google + email/password) for identity, Firestore for data, no Firebase Storage in active
use. **Reads** happen straight from the browser via the Firestore client SDK with
`onSnapshot` — realtime, cheap, gated by `firestore.rules`. **Writes** happen exclusively
through Next.js Server Actions (`"use server"`, files under `src/lib/actions/`) using
`firebase-admin`, which bypasses rules entirely — so rules are a read-gate plus a
write-*backstop*, not the source of write authorization. Money is always integer minor
units (cents); the largest-remainder method guarantees split sums are exact. See
[[Data Access Pattern]] for the full reasoning and the two rejected alternatives.

## Quick facts

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui (`components.json`, `radix-ui`) |
| Backend | Firebase: Auth, Firestore. **Not** actively using Storage (receipts were never built — see [[Settlement PDF Export]] for why the PDF avoids it too). |
| Package manager | pnpm (`packageManager` pinned in `package.json`) |
| Hosting | Vercel, `vercel.json` defines one cron job |
| Tests | Vitest (`pnpm test`), separate emulator-backed rules suite (`pnpm test:rules`, not in the default gate) |
| UI language | German (`de-DE`) only, single dictionary at `src/lib/i18n/de.ts` |
| Admin | One hardcoded email in `src/lib/auth/admin.ts`, gated on `emailVerified` |
