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
`ambient-backdrop.tsx`, `animated-money.tsx`, `save-celebration.tsx`, `monogram.tsx` — bespoke
UI, not shadcn-generated. The brand mark is `src/components/brand-mark.tsx` (the app icon's
split coin, drawn small).

## Color: monochrome + one accent

The 2026-10 redesign took the app from "several hues on every screen" (teal-tinted dark
theme, orange primary, teal accent, eight gradient avatars, ten category colors, a colored
backdrop wash) to a deliberately quiet system. The rules, in `globals.css`:

- **Neutrals carry the UI.** Background, cards, borders, muted text are near-grey with a
  faint warm cast (`oklch(L 0.002–0.006 70–85)`). Dark is graphite (`0.16`), not black and
  not tinted. Hierarchy comes from ink strength and size, not from hue.
- **One accent: muted orange (`--primary`).** For the one action that matters on a screen
  (add expense, create group, sign in), focus rings, and "something waits for you"
  (unread dot, a game round waiting for your turn). Not for decoration, not for icons.
- **Green/red are money only.** `--success` = you get, `--destructive` = you owe. Never as
  a decorative tint (a chat unread dot is orange, not red).
- **Avatars are monograms** (`.monogram` / `<Monogram>`): a quiet tile with ink lettering.
  `avatarGradient`/`memberColor` survive **only in the split games**, where telling players
  apart on a board is the point (`GameAvatar`, wheel wedges, duel marks). Don't bring them
  back into everyday screens.
- **Category tiles are one neutral style** (`categoryTileClasses`): the icon already says
  what the category is.
- **The backdrop is neutral** (`AmbientBackdrop`): one soft fall of ink-colored light from
  the top plus grain. No per-group tint, no dot-grid.
- **Own chat bubbles are ink** (`bg-foreground text-background`), not orange.

If a new screen seems to need another color, it needs hierarchy instead.

## Seven styles, switchable like light/dark

Next to light/dark/system the appearance menu (`theme-toggle.tsx`, sidebar footer and the
public pages' header) has a **Styles** entry that opens the style gallery (see below) to pick a
**style**: Graphit (default, the monochrome system above),
Original (the first colorful version, restored), Fallblatt (split-flap departure board),
Bierdeckel (the pub tab), Riso (two-color risograph), Schmetterling (lilac and pink with
butterflies, hearts and sparkles; Nunito body, Fraunces with SOFT/WONK on, a violet-to-pink
hero figure) and Herzblatt (one cherry red, pill buttons that press down, a field of red hearts
drifting slowly up behind the content, a small ♥ after the hero figure). Every style has a light and a dark variant.

- **Where it lives:** `<html data-style="…">`, stored in `localStorage["style"]`, applied
  before first paint by `THEME_INIT_SCRIPT` in `app/layout.tsx` (keep its style list in sync
  with `APP_STYLES` in `src/lib/app-style.ts`). `useAppStyle()` reads it via
  `useSyncExternalStore`, server snapshot = default, so hydration never mismatches.
- **How a style works:** `src/app/app-styles.css` redefines the token set on
  `:root[data-style=x]` (light) and `:root[data-style=x].dark` (dark), swaps faces through
  `--app-font-sans/-heading/-mono` (the `@theme inline` font tokens point at these, because
  an inline theme value is baked into utilities and couldn't change at runtime), and restyles
  a few hooks: `.monogram`, `.category-tile` (+ `category-<id>`), `.bubble-own`, `.brand-mark`,
  `.backdrop-light`/`.backdrop-texture`, `.display-figure`, and the receipt's inks on
  `.paper-tokens`. Those rules are unlayered on purpose so they beat utilities.
- **Components don't branch on style for color.** Use tokens and the hooks above; a new
  screen then works in all seven. The one markup exception is the groups overview's headline
  figure (`style-hero.tsx`): flap board, beer mat with a tally of your groups, two-ink print —
  and the group page's balance, which uses the same pieces instead of the receipt in those
  three styles (see [[Group Page]]). Schmetterling and Herzblatt use the default markup
  (receipt) and differ in CSS only.
- **Monograms carry the person's colors as CSS vars** (`monogramVars(seed)` from
  `ui/monogram.tsx`) — only Original paints them; the other styles ignore them.
- **Style fonts** (Hanken Grotesk, Martian Mono, Archivo, Bricolage Grotesque, Nunito) are loaded
  with `preload: false`: a device only downloads the faces its active style uses.
- **Motif grounds as masks.** Schmetterling's butterflies/hearts/sparkles and Herzblatt's
  hearts are inline-SVG `mask-image` tiles on `.backdrop-texture` over a token-colored fill,
  so the motif follows the theme without a second SVG per light/dark. Herzblatt's layer is one
  tile taller than the screen and drifts up one tile (transform only, off under reduced motion).
- The split games keep their per-person colors in every style.

### The style gallery: every style at once, whatever style is active

`style-picker-dialog.tsx` shows each style as a small screen of the app (headline figure in
the style's own form, two expenses, a chat bubble, the add button), laid out at phone size and
shrunk with CSS `zoom` so fonts, radii and the motif keep their proportions. Tapping a card
calls `setAppStyle` — the whole app, gallery included, switches at once; a light/dark/system
switch sits at the top so both sides of a style can be compared.

How a card shows a style that isn't the page's:

- **Tokens:** every token set in `app-styles.css` matches `[data-style-preview="x"]`
  (and `.dark [data-style-preview="x"]`) as well as `:root[data-style="x"]`. Graphit's base
  sets in `globals.css` match `:where([data-style-preview])` — zero specificity, so a card
  starts from Graphit (nothing inherited from the page's style) and its own style's set still
  wins, in the same order as on `:root`.
- **Hooks: never the page's own classes in a card.** `[data-style="y"] .display-figure`
  follows `<html>`, so a `.display-figure` inside a card would be painted by the page's style
  _and_ the card's and mix the two. Each hook rule therefore has a twin selector on a
  `preview-*` class: `.preview-figure`, `.preview-heading`, `.preview-monogram`,
  `.preview-bubble`, `.preview-brand(-glyph)`, `.preview-light`, `.preview-texture`,
  `.preview-button`. A new hook rule for a style should get its twin in the same selector list;
  `style-picker-dialog.test.tsx` fails if a page hook turns up inside a card. The hero pieces
  (`.hero-board`/`.flap`, `.coaster`, `.hero-riso`) are not keyed on the style and are reused
  as they are.
- **No animation in a card.** An animated (composited) layer inside a zoomed, clipped card
  escapes the clip in Chrome and paints a stray band over the card's corners, so the coaster
  drop, the riso registration, the flap tiles and Herzblatt's drifting hearts hold still there.

## The hero figure

`.display-figure` is the one big number on a screen — the groups overview total ("Du
bekommst 529,45 €", the first thing seen when the app opens) and the group page's receipt.
Fraunces at display size, tight tracking, tabular lining figures, in **ink**, with a small
green/red dot next to its label carrying the direction. On the overview it rises into its
line with `.animate-figure-in` (clipped by its parent, so it prints up from its baseline).

## Typography — three fonts, deliberately

`app/layout.tsx` loads `Geist` (sans, body), `Geist_Mono` (mono), and **`Fraunces`** (serif,
`axes: ["opsz", "SOFT", "WONK"]`) as CSS variables. `.font-heading` pins `SOFT 0, WONK 0`:
the wonky leaning glyphs read as a costume across a whole app, so only optical size stays
live. Headings use `font-medium` at most — Fraunces semibold is heavy. Fraunces is used specifically for
headings, dialog titles, and **money amounts** — a deliberate departure in character from the
neutral body font, per the inline comment: "the numbers that matter most (what you owe, what
you're owed) carry weight." If you're building a new screen that displays a balance
prominently, reach for the Fraunces variable, not the default sans.

## Receipt vocabulary: `.receipt-edges`, `.paper-tokens`, `InkStamp`

Two screens print on till paper: the split games' verdict slip and the group page's balance
receipt ([[Group Page]]). `.receipt-edges` masks the torn zig-zag edges (it clips
box-shadow, so elevation goes on a wrapper as `drop-shadow`). `.paper-tokens` restates the
light theme's ink, paper, status and control tokens on the slip's subtree, so a receipt stays
paper-colored in the dark theme (dimmed a step under `.dark` so it doesn't glare) — an object, not a surface — and anything printed or pressed on it
(signed amounts, settle-up buttons) keeps light-theme contrast. `InkStamp`
(`split-game/celebration.tsx`) is the rubber stamp; `animateIn={false}` prints it at rest,
`ink` overrides the person-colored ink when the color itself carries meaning.

## Tabs

`src/components/ui/tabs.tsx` wraps Radix Tabs (from the `radix-ui` monorepo package, like
every other primitive here) as a segmented control: raised active segment, whole segment as
the touch target, roving arrow-key focus from Radix.

## Dark mode: default, flash-free

Dark is the default theme (`theme-toggle.tsx`, `theme-provider.tsx`), with a light toggle.
`THEME_INIT_SCRIPT` in `app/layout.tsx` runs via `<Script strategy="beforeInteractive">`
_before_ hydration — reads `localStorage`, resolves `"system"` against
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

[[Mobile iOS Quirks]] · [[i18n]] · [[Deployment and Production Debugging]] · [[Group Page]]
