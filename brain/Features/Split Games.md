---
tags: [feature, split-games, fun]
---

# Split Games (🎲🎡🎰🎫)

Picker: `src/components/groups/split-game-picker-dialog.tsx`. Shared engine:
`src/lib/games/` (`use-sequential-draw.ts`, `random.ts`, `member-colors.ts`) and
`src/components/groups/split-game/` (`game-pool-checklist.tsx`, `game-pool-setup-step.tsx`,
`game-result-banner.tsx`, `game-progress-pips.tsx`, `game-avatar.tsx`, `scratch-card.tsx`).
Sound: `src/lib/sound/game-sounds.ts`.

## What it is

A family of gamified alternatives to manually choosing a split, all reachable from the same
"🎮 Spiel" button in `add-expense-dialog.tsx`: tapping it opens `SplitGamePickerDialog`, a 2×2
tile picker, which hands off to one of four game dialogs. Each game is, like [[Split Lottery]]
before it, purely a **front-end input mechanism** that flows through the same `resolveExpense`
/ `buildSplits` pipeline as a manually-entered split (see [[Expenses and Splitting]]) — none of
them bypass or duplicate the money-invariant logic. Three of the four (lottery, wheel, scratch)
resolve to a plain list of "loser" uids that `add-expense-dialog.tsx` turns into an equal exact
split via `splitEqual`. The slot machine is the exception — see below.

| Game | Dialog | Mechanic |
| --- | --- | --- |
| 🎲 [[Split Lottery]] | `split-lottery-dialog.tsx` | Tap-to-reveal grid, turn-based, up to 32 anonymous faces |
| 🎡 Glücksrad | `split-wheel-dialog.tsx` | Spin a wheel of the remaining pool; the needle picks the loser |
| 🎰 Spielautomat | `split-slot-dialog.tsx` | Pick a stake, pull the lever, repeat until the bill is fully allocated |
| 🎫 Rubbellos | `split-scratch-dialog.tsx` | Everyone scratches their own card; whoever gets a blank pays |

## The shared draw engine (wheel + scratch)

`useSequentialDraw` (`src/lib/games/use-sequential-draw.ts`) is what the wheel and scratch
cards sit on top of — the lottery predates it and keeps its own grid-based mechanic (see
[[Split Lottery]]). It precomputes a fixed, crypto-shuffled order of losers once at
`start(poolUids, targetCount)` — the same "decide first, animate the reveal after" pattern the
lottery's own `shuffledOutcomes` uses — so a spin or a scratch can never change who actually
pays; the interaction only reveals a result that was already fixed. Draws go through
`secureShuffle` (`src/lib/games/random.ts`), which uses `crypto.getRandomValues`, not
`Math.random` — a "who pays" decision must not be predictable or replayable.

Scratch cards borrow `useSequentialDraw` only for that fixed loser set. Unlike the wheel, every
pool member gets their own card rather than taking turns on one shared board, so the round
isn't "done" until everyone has scratched theirs, not just once the losers are found —
`split-scratch-dialog.tsx` tracks that itself (`scratchedUids`) instead of using the hook's own
`revealedCount`/`gameOver`.

## The slot machine: staked, repeated spins

The slot machine deliberately does **not** sit on `useSequentialDraw` — it isn't "pick N
distinct losers once", it's a real one-armed bandit: pick a stake (presets or a custom amount,
`expenses.slotStakeLabel`), pull the lever, and whoever the reels land on (`drawOne` from
`random.ts`, uniform draw *with* replacement) owes that stake. The same person can lose several
spins in a row — that's the point, a fixed distinct-draw guarantee would make it feel rigged
rather than like gambling. Each spin's stake is capped to whatever's left of the expense's
`amountMinor` (`effectiveStake = Math.min(stakeValue, remaining)`), so repeated spins always
land on exactly the bill total with no remainder to reconcile, however many rounds it takes.
Because different people can end up owing different amounts, `SplitSlotDialog`'s `onResolve`
takes `Record<uid, amountMinor>` directly rather than the other games' `loserUids: string[]` —
`add-expense-dialog.tsx`'s `handleSplitGameResolveAmounts` writes those amounts straight into
`exactInputs` instead of running them through `splitEqual`.

## Shared UI pieces

- `GamePoolChecklist` — just the "who's playing" member checklist, used directly by the slot
  machine (no "how many pay" concept applies to it) and wrapped by `GamePoolSetupStep` for the
  three games that also need a count.
- `GamePoolSetupStep` — `GamePoolChecklist` plus a 1..poolSize stepper, for the wheel, scratch
  cards and lottery-style setup. Callers pass their own count-hint copy and stepper icon;
  everything else, including the `expenses.game*` translation keys, is shared.
- `GameResultBanner` — the final "X zahlt." verdict banner (`expenses.gameResultOne` /
  `gameResultMultiple`) used by the wheel and scratch cards, including the `aria-live`
  announcement — visible text alone isn't announced on arrival, that's the state change screen
  readers actually hear. The slot machine has its own result view (a per-person amount
  breakdown, not a single "X zahlt." sentence) since its losers can owe different amounts.
- `GameProgressPips` — the "N of target decided" dot row used by the wheel and scratch cards;
  callers choose what the target means. The slot machine shows a running allocated/remaining
  total instead, since it has no fixed target count.
- `GameAvatar` — the deterministic name-colored initial chip used everywhere a member needs a
  small face.

`src/lib/games/member-colors.ts` gives the wheel's wedges and the slot machine's reels solid
colors keyed off the same name hash `avatarGradient` uses (`nameHash` in `lib/utils.ts`), so a
member's wheel wedge/reel color and their avatar chip always agree.

## The `viaLottery` flag, now shared

All four games set `Expense.viaLottery = true` when their result is applied — the field name is
a holdover from when the lottery was the only game (see [[Data Model]]), but its actual meaning
has always been closer to "resolved via a split mini-game", so the existing
`computeLotteryTotals` / `LotteryOverview` leaderboard already aggregates across all four games
with zero code changes needed. Renaming the field would mean migrating live Firestore data for
a purely cosmetic win, so it stays `viaLottery`.

## Related
[[Split Lottery]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Design System and Theming]]
