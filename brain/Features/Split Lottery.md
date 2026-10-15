---
tags: [feature, split-lottery, fun]
---

# Split Lottery (🎲)

> [!note] One of four
> The lottery is the original split mini-game; it now sits alongside a wheel, a slot machine
> and scratch cards behind a shared picker — see [[Split Games]] for the family overview and
> the shared engine the other three sit on. This note covers what's specific to the lottery.

UI: `src/components/groups/split-lottery-dialog.tsx`. Sound: `src/lib/sound/game-sounds.ts`.
Stats: `src/lib/money/lottery-totals.ts`. Leaderboard: the group page's Spiele tab
(`games-tab.tsx`, see [[Group Page]]).

## What it is

A gamified alternative to manually choosing a split: members tap character portraits on a
grid, and the game picks who "loses" (pays a larger/different share) instead of the group
deciding manually. Purely a **front-end input mechanism** for `add-expense-dialog.tsx` — it
still produces ordinary `splitInputs` that flow through the same `resolveExpense` /
`buildSplits` pipeline as a manually-entered split (see [[Expenses and Splitting]]). The
lottery does not bypass or duplicate the money-invariant logic; it's just a different UI for
arriving at the same `Record<uid, number>` the split functions expect.

## The `viaLottery` flag

`Expense.viaLottery?: boolean`, set to `true` only when `splitInputs` came from this game
(passed straight through `ExpenseInput.viaLottery`). It's a **forward-only marker** — rounds
played before this field existed aren't retroactively flagged, so any "vergambelt" (gambled
away) leaderboard built on it necessarily starts counting from whenever the field was added,
not from the app's actual first lottery round.

## `computeLotteryTotals`

`src/lib/money/lottery-totals.ts` — iterates expenses, skips any without `viaLottery: true`,
and for each participant with a positive split amount accumulates `amountMinor` (total lost)
and `roundsLost` (count). This is what powers the per-member "lottery losses" leaderboard.
Zero or negative splits are skipped (a participant who "won" and pays nothing doesn't count as
a loss).

## Characters and assets

`public/lottery-faces/` holds exactly two people, both **real, consented photos** (since
2026-10; the generated cartoon portraits `char1`–`char6` are gone): `char7` (sunglasses, tongue
out) and `char8` (smiling man; his "laughing" image is the monkey selfie). Each is a calm/laughing
pair, so tapping a face reads as "the same person, a different mood". Grid cells get a random one
of the two per game — a shuffled mix, not a fixed half/half. The photos are shown
`object-cover` with rounded corners (the cartoons were transparent-ish `object-contain`). The
small laugh icon in the setup step and the found-slots row is the monkey (`BADGE_CHARACTER`).
Sound effects (`playAppliedSound`, `playMissSound`, the shared catch's stamp and laugh,
`playHeartbeatSound`) and motion (`motion/react` via `src/lib/motion.ts`'s `springs`) are purely
cosmetic — no correctness surface there.

## The catch and the heartbeat (2026-10)

A laughing face is shown **full-size** (`CatchPortrait`,
`split-game/catch-portrait.tsx`): the photo fills the dialog as big as the screen allows
(`min(88vw, 56dvh, 28rem)`), landing with a spring on the stamp's impact frame
(`STAMP_IMPACT_S`, so `useCatchFlashes`' thump and laugh still read as one hit), with only a quiet
line below it — avatar and name, then `CatchCaption` (what they owe once final, or the count).
It replaced the shared `CatchFlash` slip (receipt, ink stamp, confetti, a 96px face peeking over
its corner) _for the lottery only_; every other game still uses `CatchFlash`. The timing, sounds,
shake, haptics and the board lock (`catches.isActive()`) are unchanged, since they live in
`useCatchFlashes`. The full-size laugh images are preloaded with the same `sizes`
(`CATCH_PORTRAIT_SIZES`) so the photo never arrives after the laugh. Between taps a heartbeat
quickens as the safe faces run out ("Noch 2 von 5 Gesichtern lachen"). Why and how:
[[Split Games#The catch moment, for every payer, with the amount]]. At most everyone but one can
pay ([[Split Games#Everyone but one]]).

## Related

[[Split Games]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Design System and Theming]]
