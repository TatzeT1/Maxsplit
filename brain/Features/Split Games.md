---
tags: [feature, split-games, fun]
---

# Split Games (🎲🎡🎰🎫)

Picker: `src/components/groups/split-game-picker-dialog.tsx`. Shared engine:
`src/lib/games/` (`use-sequential-draw.ts`, `random.ts`, `member-colors.ts`) and
`src/components/groups/split-game/` (`game-pool-setup-step.tsx`, `game-result-banner.tsx`,
`game-progress-pips.tsx`, `game-avatar.tsx`, `scratch-card.tsx`). Sound:
`src/lib/sound/game-sounds.ts`.

## What it is

A family of gamified alternatives to manually choosing a split, all reachable from the same
"🎮 Spiel" button in `add-expense-dialog.tsx`: tapping it opens `SplitGamePickerDialog`, a 2×2
tile picker, which hands off to one of four game dialogs. Each game is, like [[Split Lottery]]
before it, purely a **front-end input mechanism** — it resolves to a list of "loser" uids that
`add-expense-dialog.tsx` turns into an ordinary exact split via `splitEqual`, then flows
through the same `resolveExpense` / `buildSplits` pipeline as a manually-entered split (see
[[Expenses and Splitting]]). None of them bypass or duplicate the money-invariant logic.

| Game | Dialog | Mechanic |
| --- | --- | --- |
| 🎲 [[Split Lottery]] | `split-lottery-dialog.tsx` | Tap-to-reveal grid, turn-based, up to 32 anonymous faces |
| 🎡 Glücksrad | `split-wheel-dialog.tsx` | Spin a wheel of the remaining pool; the needle picks the loser |
| 🎰 Spielautomat | `split-slot-dialog.tsx` | Pull the lever; three reels stop in sequence on the same member |
| 🎫 Rubbellos | `split-scratch-dialog.tsx` | Everyone scratches their own card; whoever gets a blank pays |

## The shared draw engine

`useSequentialDraw` (`src/lib/games/use-sequential-draw.ts`) is what the wheel, slot machine
and scratch cards all sit on top of — the lottery predates it and keeps its own grid-based
mechanic (see [[Split Lottery]]). It precomputes a fixed, crypto-shuffled order of losers once
at `start(poolUids, targetCount)` — the same "decide first, animate the reveal after" pattern
the lottery's own `shuffledOutcomes` uses — so a spin, a lever pull or a scratch can never
change who actually pays; the interaction only reveals a result that was already fixed. Draws
go through `secureShuffle` (`src/lib/games/random.ts`), which uses `crypto.getRandomValues`,
not `Math.random` — a "who pays" decision must not be predictable or replayable.

Scratch cards borrow `useSequentialDraw` only for that fixed loser set. Unlike the wheel and
slot machine, every pool member gets their own card rather than taking turns on one shared
board, so the round isn't "done" until everyone has scratched theirs, not just once the losers
are found — `split-scratch-dialog.tsx` tracks that itself (`scratchedUids`) instead of using
the hook's own `revealedCount`/`gameOver`.

## Shared UI pieces

- `GamePoolSetupStep` — the "who's playing / how many pay" setup step, identical across the
  three sequential-draw games (member checklist + a 1..poolSize stepper). Callers pass their
  own count-hint copy and stepper icon; everything else, including the `expenses.game*`
  translation keys, is shared.
- `GameResultBanner` — the final "X zahlt." verdict banner (`expenses.gameResultOne` /
  `gameResultMultiple`), including the `aria-live` announcement — visible text alone isn't
  announced on arrival, that's the state change screen readers actually hear.
- `GameProgressPips` — the "N of target decided" dot row; callers choose what the target
  means (draws remaining for the wheel/slot, total cards for scratch).
- `GameAvatar` — the deterministic name-colored initial chip used everywhere a member needs a
  small face.

`src/lib/games/member-colors.ts` gives the wheel's wedges and the slot machine's reels solid
colors keyed off the same name hash `avatarGradient` uses (`nameHash` in `lib/utils.ts`), so a
member's wheel wedge/reel color and their avatar chip always agree.

## The `viaLottery` flag, now shared

All four games set `Expense.viaLottery = true` when their `loserUids` result is applied — the
field name is a holdover from when the lottery was the only game (see [[Data Model]]), but its
actual meaning has always been closer to "resolved via a split mini-game", so the existing
`computeLotteryTotals` / `LotteryOverview` leaderboard already aggregates across all four games
with zero code changes needed. Renaming the field would mean migrating live Firestore data for
a purely cosmetic win, so it stays `viaLottery`.

## Related
[[Split Lottery]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Design System and Theming]]
