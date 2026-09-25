---
tags: [feature, split-lottery, fun]
---

# Split Lottery (🎲)

> [!note] One of four
> The lottery is the original split mini-game; it now sits alongside a wheel, a slot machine
> and scratch cards behind a shared picker — see [[Split Games]] for the family overview and
> the shared engine the other three sit on. This note covers what's specific to the lottery.

UI: `src/components/groups/split-lottery-dialog.tsx`. Sound: `src/lib/sound/game-sounds.ts`.
Stats: `src/lib/money/lottery-totals.ts`. Leaderboard: `lottery-overview.tsx`.

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

`public/lottery-faces/*.png` — calm/laughing pairs per character (`char1`, `char3`, `char4`,
...; note the gaps in numbering, that's not a bug, just which assets exist), so tapping a face
reads as "the same person, a different mood" rather than swapping to an unrelated image.
Grid cells get a random cast member per game, mixed across the board rather than one face
repeated. Sound effects (`playAppliedSound`, `playLaughSound`, `playMissSound`) and motion
(`motion/react` via `src/lib/motion.ts`'s `springs`) are purely cosmetic — no correctness
surface there.

## Related
[[Split Games]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Design System and Theming]]
