---
tags: [feature, offline, pwa]
---

# Offline Mode

**View-only, by design** (the owner's choice, 2026-09; ADR-004 in `docs/DECISIONS.md`). The installed
app opens without a connection and shows everything this device loaded before — groups,
balances, expenses, chat, the GiroCode (drawn on the device) and the CSV export (built in
the browser). Nothing can be changed offline: writes are Server Actions ([[Data Access
Pattern]]), so there is nothing to queue, and every button that saves is disabled instead.

## The three layers

1. **Data — Firestore's persistent cache** (`src/lib/firebase/client.ts`):
   `initializeFirestore` with `persistentLocalCache` and `persistentMultipleTabManager`,
   browser only. Every existing `onSnapshot` first answers from IndexedDB, then live. This
   is also what makes a normal start feel instant.
2. **Pages — the service worker** (`public/sw.js`, registered by
   `components/service-worker-registration.tsx`, production builds only):
   - `/_next/static/*` cache-first (names change with content), trimmed to 300 entries;
   - navigations network-first, falling back to the last copy after a network error — or
     after a **6 s** stall, but only when there is a copy to show (a slow page with no
     copy is waited for); one copy per path (`?tab=` is client state). `/api/*` and the
     public `/share/*` PDF are passed through untouched;
   - offline `/` (the manifest's `start_url`, which redirects signed-in people) → a
     redirect to the saved `/groups`, which only exists while signed in;
   - a page never saved → `public/offline.html` (self-contained, reads the `locale` cookie
     and the stored theme);
   - RSC fetches, prefetches, Server Actions and `/api/*` are not touched. Offline, a
     failed RSC fetch makes Next fall back to a full page load — which lands in the
     navigation handler.
   - `sw.js` is served `no-cache` with its own CSP (`next.config.ts`). **Bump `VERSION`**
     when its caching rules or `offline.html` change — a device only reinstalls the worker
     when the file's bytes change.
3. **Honesty — sync marks** (`src/lib/offline/sync-marks.ts`): per user and screen
   (`<uid>:groups`, `<uid>:group:<id>`, `<uid>:chat:<id>`), the last time that screen's
   listeners were all live (`metadata.fromCache === false`, tracked by
   `useLiveSources` with `{ includeMetadataChanges: true }`). They drive:
   - the banner (`components/offline-banner.tsx`): "Offline – nur ansehen · Stand 29.09.,
     14:32", or "Keine Verbindung – nur ansehen" when the device claims to be online but
     the screen hasn't turned live for 8 s (Wi-Fi that goes nowhere);
   - `NeedsConnection` instead of the screen when there's no mark: an empty cache would
     otherwise read as "Alle sind quitt" / "no groups" — a failure looking like a normal
     state, which AGENTS.md forbids.

Game pages (`tournament-page-client.tsx`) show `NeedsConnection` whenever offline: every
move goes through the server, and it keeps the runner from calling `openOnlineMatch`.

## Writes while offline

`useOnline()` (`src/lib/use-online.ts`, `navigator.onLine`) disables every saving control:
add/record/edit/delete, create/join group, settings, members, recurring rules, chat send,
PDF export (server-rendered), profile forms. For the case `navigator.onLine` misses,
`callAction()` (`src/lib/call-action.ts`) turns a thrown Server Action call into
`{ ok: false, error: "network" }` → "nichts gespeichert". Before it, an offline save left
the add-expense dialog spinning forever (the rejected `await` skipped `setLoading(false)`).

**New write button? Disable it on `!useOnline()` and call the action through
`callAction`.**

## Sign-out wipes it

`useSignOut` → `clearLocalData()` (`src/lib/offline/clear-local-data.ts`): terminates
Firestore and runs `clearIndexedDbPersistence`, deletes every saved page except
`offline.html`, clears the sync marks — then a full reload (a terminated Firestore can't
be reused). It also works offline now: the cookie `DELETE` failing no longer skips the
local sign-out; SessionGuard clears the cookie on the next online visit. A second open tab
can block the IndexedDB delete; it signs out too (auth state is shared) and clears then.

## Limits

- Only what this device loaded before. A never-opened group → `offline.html` (page not
  saved) or `NeedsConnection` (page saved, data not).
- iOS Safari deletes a website's storage after 7 days without a visit; the installed
  home-screen app is exempt. See [[Mobile iOS Quirks]].
- Both auth states survive offline: Firebase Auth restores the user from IndexedDB; the
  server cookie isn't consulted because the page comes from the worker. See
  [[Two Auth States]].

## Testing it

`context.setOffline(true)` in Playwright doesn't reach `navigator.onLine` on a reused page;
use CDP `Network.emulateNetworkConditions({ offline: true })` after each load, and **kill
the Next server** so the worker's own fetches fail too. A persistent browser profile keeps
the worker and caches across script runs. See [[Local Development and Testing]].

## Related

[[Push Notifications]] (same worker) · [[Data Access Pattern]] · [[Two Auth States]] ·
[[Balances and Settlements]] (GiroCode offline)
