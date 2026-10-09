---
tags: [frontend, mobile, ios, gotcha]
---

# Mobile iOS Quirks

> [!danger] Mobile is the primary surface for this app
> Both rules below shipped as "the chat is unusable on my phone" bugs, and both are
> **invisible on a desktop browser, and invisible in a resized desktop window.** Only a real
> iOS device (or a deliberate simulation) shows them. If you touch layout, inputs, or anything
> keyboard-adjacent, verify on-device or say explicitly that you couldn't.

## Rule 1 — any focused text field must be ≥16px on mobile

Below 16px, iOS Safari auto-zooms the entire page on focus. That shoves the right-hand side of
the layout off-screen and scrolls whatever the user is typing out of view — a strictly worse
experience than the zoom was ever meant to prevent.

`src/components/ui/input.tsx` and `src/components/ui/select.tsx` encode the fix as
`text-base ... md:text-sm` — **16px on phones, 14px from `md` breakpoint up**. Any raw
`<input>`/`<textarea>` written outside those two shared components must repeat this pattern
manually. Checkboxes and radios are exempt — only text entry triggers the zoom.

## Rule 2 — iOS ignores `interactiveWidget: "resizes-content"`

`app/layout.tsx`'s `viewport.interactiveWidget: "resizes-content"` makes **Android Chrome**
genuinely shrink the layout viewport when the keyboard opens — so `100dvh` correctly reflects
the visible area there. **iOS does not honor this hint, standalone PWA included**: the
keyboard _overlays_ a layout viewport that still thinks it's full height. `dvh` never changes,
and anything pinned to the bottom (a chat composer) ends up hidden behind the keyboard.

The only thing that reports the truth on iOS is `window.visualViewport`. That's what
`useVisibleHeight` (`src/lib/use-visible-height.ts`) exists for — see its extensive doc
comments for the coordinate-frame math (visual viewport vs. layout viewport, why
`offsetTop` and `getBoundingClientRect().top` must not both get `scrollY` added). [[Chat]] is
the primary consumer.

### The trap: padding makes it worse, not better

`body { min-height: 100% }` in the global CSS makes the height chain **deliberately
indefinite**, so ordinary pages can grow and scroll normally. A screen that needs a
keyboard-safe fixed frame (chat) needs the _opposite_: a definite height, not "grow to fit."

> [!danger] Do not "fix" a keyboard-overlap bug by adding bottom padding
> Padding makes the **document taller**, not the visible content shorter. This was tried and
> measured: it grew the page from 664px to 898px and pushed the composer _further_ down,
> making the bug worse. `useVisibleHeight` pins the frame to a definite, measured height
> instead — that's the only correct fix for this class of problem.

### Rule 2 applied: the Schätzfragen guess screen

The one-phone game dialog and the online round page both end in a number field, which makes them
the second keyboard-heavy screen after [[Chat]] — and the hard case, because the field sits inside
the game stage's scroller (`[data-slot="stage-scroller"]`), not on a free-standing page.
`EstimateGuessPanel` (`split-game/estimate/estimate-guess-input.tsx`) therefore follows the rule
to the letter:

- **One keyboard frame.** The compact question card, the field with its echo line, the range
  hint and the lock button live in **one** wrapper, sized with `maxHeight: visibleHeight`
  (`useVisibleHeight`), **never `height`** and never bottom padding. Without a keyboard the frame
  keeps its natural height; with one it is capped at the visible band. The question card is the
  part that shrinks and scrolls (`min-h-0 flex-1 overflow-y-auto`); the field and the button are
  `shrink-0`, so the button is always above the keyboard. Seats, countdown and everything else go
  _after_ the frame. This is the "definite height, not padding" rule above, applied: a definite
  cap on the frame instead of a taller document.
- **A text field inside a scroller.** On focus WebKit scrolls it into view inside every
  scrollable ancestor **without any viewport event**: the frame's top moves while `visualViewport`
  stays silent, so the measured bottom goes stale — under the keypad. `useVisibleHeight` has a
  `scroller` option (default: the stage scroller) that re-measures on the scroller's `scroll` and
  on `focusin`, and a `revealFocused` option that scrolls the form into view once the frame has
  been resized. A frame with no such ancestor (the chat) installs none of it.
- **iPhone number pads have no Return key.** `inputMode="decimal"` (`"numeric"` for a year) shows
  a pad without one, and `enterKeyHint` does nothing there. The form's only submit is its button,
  which must therefore be visible with the pad open — which the single frame guarantees. The field
  is a plain text input (`type="text"` with `inputMode`), because the locale-aware parser
  (`parseEstimateInput`) reads what was typed itself — a comma, a grouped "1.000" — instead of
  leaving it to the browser's `type="number"`.
- **16 px (Rule 1)** comes from the shared `Input` (`text-base md:text-sm`); no autofocus either,
  since a shared phone must not pop the keyboard up on a hand-over.

## Push and offline on iOS

- **Push only for the home-screen app** (iOS 16.4+). In a Safari tab `PushManager` isn't
  there; the profile says how to install instead of offering a button that can't work.
- **Permission only from a tap**: `Notification.requestPermission()` must be the first
  await in the click handler, or iOS refuses it.
- **Every push must show a notification** — Safari revokes the permission of a site whose
  pushes stay silent, so the worker never skips one.
- **Storage eviction**: Safari deletes a website's storage (the offline copy included)
  after 7 days without a visit; the installed app keeps it. See [[Offline Mode]] and
  [[Push Notifications]].

## Related

[[Chat]] · [[Two Auth States]] (a different "invisible except in the failure state" bug class) · [[Design System and Theming]]
