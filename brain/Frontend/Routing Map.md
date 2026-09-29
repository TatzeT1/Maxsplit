---
tags: [frontend, routing, nextjs]
---

# Routing Map

Next.js App Router, `src/app/`. This note is the "what guards what" map — see
[[Data Access Pattern]] for _why_ the guarding works this way.

```
/                                    public — landing/sign-in (page.tsx)
/onboarding                          first-run setup guide (requires session; see Onboarding)
/invite/[code]                       invite-code landing (preview → join flow)
/share/settlement/[groupId]/[token]  PUBLIC, no session — see Settlement PDF Export

/play/[groupId]/[tournamentId]     public invite link (WhatsApp/share): signed in → redirect to the game;
                                      signed out → sign-in that returns to it. Reveals nothing about the game.
(app)/                               layout.tsx: redirect("/") if !getSession()
                                      → renders AppSidebar + SessionGuard (see Two Auth States)
  /groups                            group list (balancesMinor cache — see Data Model)
  /groups/[groupId]                  group detail — see Group Page; ?tab=balances|games|group
  /groups/[groupId]/chat             per-group chat — see Chat, Mobile iOS Quirks
  /groups/[groupId]/tournaments/[tournamentId]
                                      live tournament bracket / online duel board — watch/play from any device, see Split Games
  /profile                           profile + payment details — see Onboarding and Payment Details
  /admin                             requireAdminSession() → notFound() if not admin
  /admin/groups/[groupId]            admin group moderation
  /admin/users/[uid]                 admin user moderation (ban, reset onboarding)

api/
  /api/auth/session                  POST mints session cookie, DELETE clears it
  /api/cron/recurring                GET, Bearer $CRON_SECRET only — see Recurring Expenses

public/ (static, not routes)
  /sw.js                             the service worker — offline start + push; no-cache headers
  /offline.html                      what the worker shows for a page never saved on this device
```

## Layering of guards

1. **`(app)/layout.tsx`** — server-side `getSession()` check. No cookie → hard `redirect("/")`.
   This is the _only_ place route access is decided; individual pages under `(app)` don't
   re-check session existence.
2. **`SessionGuard`** (client, wraps `{children}` inside the layout) — catches the case where
   the cookie is valid but client Firebase Auth desynced (see [[Two Auth States]]). Not a
   route guard in the Next.js sense — a render-time recovery mechanism.
3. **`requireAdminSession()`** — a second, independent gate layered _on top of_ the above for
   `/admin/**` pages specifically. A signed-in non-admin reaches `(app)/layout.tsx` fine and
   only gets stopped inside the admin page itself, via `notFound()` (404, not a redirect —
   see [[Admin Panel]] for why that distinction matters).

## Error and 404 boundaries

A render error used to fall through to Next's built-in English "Application error" page — no
retry, no way back. Now (all German, all rendering `PageError`, `src/components/page-error.tsx`):

- `app/(app)/error.tsx` — a page under the signed-in shell failed; the fallback renders
  _inside_ the shell, so the sidebar stays usable.
- `app/error.tsx` — anything else below the root layout, including `(app)/layout.tsx` itself
  (an `error.tsx` never wraps the layout of its own segment).
- `app/global-error.tsx` — the root layout itself failed. It replaces the whole document, so
  it has no `LocaleProvider` (translates with `translate(DEFAULT_LOCALE, …)` directly), no
  theme script (static `dark`, the default theme) and imports `globals.css` itself.
- `app/not-found.tsx` — unmatched URLs and every `notFound()`, including the admin pages'
  deliberate 404 for non-admins; its copy never confirms a route exists.

Next 16.3 hands error boundaries `retry` (re-fetch and re-render the segment), which
replaced the older `reset`. `PageError` always `console.error`s the error and shows its
`digest` (the id that matches a production server error to the logs) — a crash is never
silent, the same rule as for Firestore listeners ([[Two Auth States]]).

## `/share/settlement/[groupId]/[token]` is structurally outside `(app)`

It's not nested under the `(app)` route group at all, specifically so it never goes through
`(app)/layout.tsx`'s session redirect. Its own access control is the token match inside the
route handler itself — see [[Settlement PDF Export]].

## Related

[[Data Access Pattern]] · [[Two Auth States]] · [[Admin Panel]] · [[Settlement PDF Export]] · [[Group Page]]
