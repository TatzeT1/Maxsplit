---
tags: [frontend, routing, nextjs]
---

# Routing Map

Next.js App Router, `src/app/`. This note is the "what guards what" map — see
[[Data Access Pattern]] for *why* the guarding works this way.

```
/                                    public — landing/sign-in (page.tsx)
/onboarding                          first-run setup guide (requires session; see Onboarding)
/invite/[code]                       invite-code landing (preview → join flow)
/share/settlement/[groupId]/[token]  PUBLIC, no session — see Settlement PDF Export

(app)/                               layout.tsx: redirect("/") if !getSession()
                                      → renders AppSidebar + SessionGuard (see Two Auth States)
  /groups                            group list (balancesMinor cache — see Data Model)
  /groups/[groupId]                  group detail: expenses, balances, members, activity
  /groups/[groupId]/chat             per-group chat — see Chat, Mobile iOS Quirks
  /profile                           profile + payment details — see Onboarding and Payment Details
  /admin                             requireAdminSession() → notFound() if not admin
  /admin/groups/[groupId]            admin group moderation
  /admin/users/[uid]                 admin user moderation (ban, reset onboarding)

api/
  /api/auth/session                  POST mints session cookie, DELETE clears it
  /api/cron/recurring                GET, Bearer $CRON_SECRET only — see Recurring Expenses
```

## Layering of guards

1. **`(app)/layout.tsx`** — server-side `getSession()` check. No cookie → hard `redirect("/")`.
   This is the *only* place route access is decided; individual pages under `(app)` don't
   re-check session existence.
2. **`SessionGuard`** (client, wraps `{children}` inside the layout) — catches the case where
   the cookie is valid but client Firebase Auth desynced (see [[Two Auth States]]). Not a
   route guard in the Next.js sense — a render-time recovery mechanism.
3. **`requireAdminSession()`** — a second, independent gate layered *on top of* the above for
   `/admin/**` pages specifically. A signed-in non-admin reaches `(app)/layout.tsx` fine and
   only gets stopped inside the admin page itself, via `notFound()` (404, not a redirect —
   see [[Admin Panel]] for why that distinction matters).

## `/share/settlement/[groupId]/[token]` is structurally outside `(app)`

It's not nested under the `(app)` route group at all, specifically so it never goes through
`(app)/layout.tsx`'s session redirect. Its own access control is the token match inside the
route handler itself — see [[Settlement PDF Export]].

## Related
[[Data Access Pattern]] · [[Two Auth States]] · [[Admin Panel]] · [[Settlement PDF Export]]
