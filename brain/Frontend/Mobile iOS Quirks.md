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
keyboard *overlays* a layout viewport that still thinks it's full height. `dvh` never changes,
and anything pinned to the bottom (a chat composer) ends up hidden behind the keyboard.

The only thing that reports the truth on iOS is `window.visualViewport`. That's what
`useVisibleHeight` (`src/lib/use-visible-height.ts`) exists for — see its extensive doc
comments for the coordinate-frame math (visual viewport vs. layout viewport, why
`offsetTop` and `getBoundingClientRect().top` must not both get `scrollY` added). [[Chat]] is
the primary consumer.

### The trap: padding makes it worse, not better

`body { min-height: 100% }` in the global CSS makes the height chain **deliberately
indefinite**, so ordinary pages can grow and scroll normally. A screen that needs a
keyboard-safe fixed frame (chat) needs the *opposite*: a definite height, not "grow to fit."

> [!danger] Do not "fix" a keyboard-overlap bug by adding bottom padding
> Padding makes the **document taller**, not the visible content shorter. This was tried and
> measured: it grew the page from 664px to 898px and pushed the composer *further* down,
> making the bug worse. `useVisibleHeight` pins the frame to a definite, measured height
> instead — that's the only correct fix for this class of problem.

## Related
[[Chat]] · [[Two Auth States]] (a different "invisible except in the failure state" bug class) · [[Design System and Theming]]
