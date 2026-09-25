---
tags: [frontend, design, theming, shadcn]
---

# Design System and Theming

Config: `components.json` (shadcn/ui), `src/app/globals.css`, `src/lib/motion.ts`,
`src/components/theme-provider.tsx` / `theme-toggle.tsx`.

## Component layer: shadcn/ui + Radix

`src/components/ui/*` are shadcn/ui components generated into the repo (not an npm
dependency you `npm update` — see `components.json` for the generator config), built on
`radix-ui` primitives, styled with Tailwind v4 + `class-variance-authority` + `tailwind-merge`
(via `cn()` in `src/lib/utils.ts`). Treat `src/components/ui/*` as local, editable code, not a
vendored black box — but keep changes consistent with the shadcn conventions (variant props via
`cva`, `asChild` via Radix `Slot`) so future `shadcn add` runs don't fight your edits.

Notable non-stock additions living alongside the generated primitives:
`ambient-backdrop.tsx`, `animated-money.tsx`, `save-celebration.tsx`, `feature-pins.tsx`,
`hero-10.tsx`/`hero-10-utils/` — bespoke marketing/celebration UI, not shadcn-generated.

## Typography — three fonts, deliberately

`app/layout.tsx` loads `Geist` (sans, body), `Geist_Mono` (mono), and **`Fraunces`** (serif,
`axes: ["opsz", "SOFT", "WONK"]`) as CSS variables. Fraunces is used specifically for
headings, dialog titles, and **money amounts** — a deliberate departure in character from the
neutral body font, per the inline comment: "the numbers that matter most (what you owe, what
you're owed) carry weight." If you're building a new screen that displays a balance
prominently, reach for the Fraunces variable, not the default sans.

## Dark mode: default, flash-free

Dark is the default theme (`theme-toggle.tsx`, `theme-provider.tsx`), with a light toggle.
`THEME_INIT_SCRIPT` in `app/layout.tsx` runs via `<Script strategy="beforeInteractive">`
*before* hydration — reads `localStorage`, resolves `"system"` against
`prefers-color-scheme`, and adds the `dark` class to `<html>` synchronously. This exists purely
to avoid a flash of the wrong theme; **keep it in sync with `theme-provider.tsx`** if you
change how theme preference is stored or resolved — the two must agree on the same
localStorage key and the same three-value (`light`/`dark`/`system`) semantics, or the
pre-hydration guess and the post-hydration provider will disagree and flash.

## Motion

`src/lib/motion.ts` centralizes `motion/react` (Motion, formerly Framer Motion) spring
presets (`springs`) — components like `split-lottery-dialog.tsx` and `save-celebration.tsx`
import shared spring configs from here rather than inventing per-component tuning, and check
`useReducedMotion()` before playing decorative animation.

## Security headers as part of "how this app is served"

Not visual design, but part of what every page looks like to a browser: `next.config.ts`
sets `X-Frame-Options: DENY` + `frame-ancestors 'none'` (money actions and the public
settlement PDF are never meant to render inside a frame), HSTS with preload, and notably
`Cross-Origin-Opener-Policy: same-origin-allow-popups` — Vercel's platform default is a
stricter COOP that silently breaks `signInWithPopup` (the opener tab can no longer poll
`window.closed` on the popup, so `onAuthStateChanged` never fires even though the server
session cookie was set correctly). See [[Deployment and Production Debugging]] for the full
header list and reasoning.

## Related
[[Mobile iOS Quirks]] · [[i18n]] · [[Deployment and Production Debugging]]
