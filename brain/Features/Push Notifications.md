---
tags: [feature, push, pwa]
---

# Push Notifications

Five events, each switchable in the profile (ADR-004 in `docs/DECISIONS.md`):

| Event (`PushEvent`)              | Who gets it                                                       | Example                                                                |
| -------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `expense` — Neue Ausgabe mit dir | everyone with a share or money laid out, minus whoever entered it | "Max hat „Pizza“ eingetragen – du schuldest dafür 22,50 €"             |
| `settlement` — Zahlung erhalten  | the receiver, unless they entered it                              | "Ben hat dir 52,50 € gezahlt"                                          |
| `challenge` — Herausforderung    | everyone drawn into an **online** game, minus the challenger      | "Max fordert dich zu Vier gewinnt heraus – es geht um Pizza · 36,00 €" |
| `turn` — Du bist dran            | the player to move / whose match is waiting                       | "Lea hat gezogen – Tic-Tac-Toe in WG Küche"                            |
| `chat` — Chat-Nachricht          | every other member with an account; one `tag` per group chat      | "Max: Wer bringt Getränke mit?"                                        |

Placeholders never get one (no account, no device). Recurring bookings (cron) and a
game's auto-booked stake also produce `expense` pushes — the stake one skips the game's
players, who watched it happen.

## Architecture

- **Standard Web Push** with VAPID and the `web-push` library, straight to the browsers'
  push services (FCM for Chrome, Mozilla, Apple, WNS). No Firebase Cloud Messaging, no
  cost. Payloads are encrypted end to end (aes128gcm) — push services can't read amounts.
- **Keys**: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (+ optional `VAPID_SUBJECT`, default
  `https://$VERCEL_PROJECT_PRODUCTION_URL`) — runtime server vars, **not** `NEXT_PUBLIC_*`:
  the profile page (Server Component) hands the public key down, so rotating it needs no
  cache-less rebuild. No keys → push is off and the profile section is hidden. A half-set
  or malformed pair fails the build (`assertVapidEnvFormat` in `next.config.ts`).
- **Subscriptions**: top-level `pushSubscriptions/{sha256(endpoint)}` holding `uid`,
  `endpoint`, `keys`, `locale` and timestamps (`src/lib/push/store.ts`). Keyed by
  endpoint, so a device belongs to one account: the next person turning push on for the
  same phone takes the document over. Rules deny clients entirely.
- **Allowed endpoints** (`src/lib/push/endpoints.ts`): only the known push-service hosts —
  the server POSTs to whatever endpoint a client registers, so anything else would be an
  SSRF hole. `PUSH_EXTRA_ENDPOINT_HOSTS` adds a host for a local fake push service only.
- **Preferences**: `users/{uid}.notificationPrefs` (absent = on), in `Session`; apply to
  every device of the account.
- **Messages** (`src/lib/push/messages.ts`, pure, unit-tested): builders return
  `PendingPush` with translation keys, rendered per subscription in that device's language
  (`render.ts`) — the language the app had when the device subscribed, kept current by
  `PushSubscriptionSync` on app start.
- **Sending** (`notify.ts`): `notifyAfterResponse(pushes)` wraps `after()` from
  `next/server` — a push can never delay or fail the action. `deliver.ts` honors prefs,
  skips "turn" for a watching player, deletes subscriptions the service answers 404/410,
  and logs other failures. Emulator tests swap `notify.ts` for `src/test/push-mock.ts`.
- **Presence**: `markTournamentPresence` writes `groups/{g}/tournaments/{t}/presence/{uid}`
  every 20 s while a game page or the group page's game banner is visible
  (`useTournamentPresence`); a beat under 50 s old means "watching" → no "Du bist dran".
  Server-only data.
- **Service worker** (`public/sw.js`, shared with [[Offline Mode]]): shows every push
  (Safari revokes the permission of a site whose pushes stay silent), same `tag` replaces
  quietly, a tap focuses/navigates an open window or opens one — same origin only. After
  showing one it posts `notification-shown` to open windows.
- **Clearing what's been seen** (`src/lib/push/dismiss.ts`, run by
  `ServiceWorkerRegistration`): while a page is visible, this device's notifications whose
  `url` leads to that pathname are closed — on open, on return from the background, and on
  `notification-shown`. Chat → that group's chat pushes; group page → its expense and
  payment pushes; tournament → its challenge and turn. Every push is still delivered;
  this only keeps the lock screen from filling with things already read. **Per device
  only**: reading on the laptop can't clear the phone — that would take a silent push,
  which Safari punishes (see above).

## The device side (`src/lib/push/client.ts`, `components/notification-settings.tsx`)

- `Notification.requestPermission()` is the **first** await in the click handler — iOS
  refuses a request outside the tap.
- iPhone/iPad: push only for the **home-screen app**, iOS 16.4+; in a Safari tab the
  profile explains how to install. See [[Mobile iOS Quirks]].
- A subscription made with an old VAPID key is replaced on re-enable.
- **Sign-out unsubscribes the device** (server first, while the session exists) — a
  shared phone must not keep getting the previous person's pushes.
- "Test-Nachricht senden" (`sendTestPush`) delivers immediately (not after the response)
  and reports whether anything went out.

## Testing it

Unit: `messages.test.ts`, `vapid.test.ts`, `endpoints.test.ts`. Emulator:
`push.emulator.test.ts` (which actions queue what, subscription storage and takeover,
prefs, presence, 410 cleanup, the test push through a mocked `web-push`). End to end
(2026-09-29): a fake HTTPS push service trusted via `NODE_EXTRA_CA_CERTS`, a stubbed
`PushManager` in the page, and the payload decrypted with `http_ece` using the test's own
device key; the worker's display checked with CDP `ServiceWorker.deliverPushMessage` in
full Chromium (`channel: "chromium"` — headless shell reports notifications as denied).

## Related

[[Offline Mode]] · [[Split Games]] (challenges, turns) · [[Data Model]] · [[Firestore Rules]]
· [[Environment and Config]]
