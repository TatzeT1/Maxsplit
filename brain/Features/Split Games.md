---
tags: [feature, split-games, fun]
---

# Split Games (🎲🎡🎰🎫 · ⭕🔴🧠⚡)

Picker: `src/components/groups/split-game-picker-dialog.tsx`. Shared "luck" engine:
`src/lib/games/` (`use-sequential-draw.ts`, `random.ts`, `member-colors.ts`) and
`src/components/groups/split-game/` (`game-pool-checklist.tsx`, `game-pool-setup-step.tsx`,
`game-result-banner.tsx`, `game-progress-pips.tsx`, `game-avatar.tsx`, `scratch-card.tsx`).
Shared "skill" engine (the four duel games — see below): `src/lib/games/knockout-ladder.ts` +
`use-knockout-ladder.ts`, `src/components/groups/split-game/duel-game-dialog.tsx` (the shell),
`duel-ladder.tsx`, `duel-turn-banner.tsx`. Picker data: `split-game/game-catalog.ts` +
`game-preview.tsx`. Sound: `src/lib/sound/game-sounds.ts`.

## What it is

A family of gamified alternatives to manually choosing a split, all reachable from the same
"🎮 Spiel" button in `add-expense-dialog.tsx`: tapping it opens `SplitGamePickerDialog`, a
two-category tile picker (see [[#The picker: two categories and a preview step]]), which hands
off to one of eight game dialogs. Every game is, like [[Split Lottery]] before it, purely a
**front-end input mechanism** that flows through the same `resolveExpense` / `buildSplits`
pipeline as a manually-entered split (see [[Expenses and Splitting]]) — none of them bypass or
duplicate the money-invariant logic. All of them but the slot machine resolve to a plain list
of "loser" uids that `add-expense-dialog.tsx` turns into an equal exact split via `splitEqual`.
The slot machine is the exception — see below.

The eight games split into two categories, each with its own resolution engine:

| Category | Games | How "who pays" is decided |
| --- | --- | --- |
| **Glücksspiele** (luck) | 🎲 Lottery, 🎡 Wheel, 🎰 Slot, 🎫 Scratch | A crypto-random draw — see `useSequentialDraw` below |
| **Minispiele** (skill) | ⭕ Tic-Tac-Toe, 🔴 Vier gewinnt, 🧠 Memory-Duell, ⚡ Reaktionsduell | A 1-vs-1 duel, scaled to any pool size by a knockout ladder — see below |

| Game | Dialog | Mechanic |
| --- | --- | --- |
| 🎲 [[Split Lottery]] | `split-lottery-dialog.tsx` | Tap-to-reveal grid, turn-based, up to 32 anonymous faces |
| 🎡 Glücksrad | `split-wheel-dialog.tsx` | Spin a wheel of the remaining pool; the needle picks the loser |
| 🎰 Spielautomat | `split-slot-dialog.tsx` | Pick a stake, pull the lever, repeat until the bill is fully allocated |
| 🎫 Rubbellos | `split-scratch-dialog.tsx` | Everyone scratches their own card; whoever gets a blank pays |
| ⭕ Tic-Tac-Toe | `split-tic-tac-toe-dialog.tsx` | 3×3 grid, alternating marks; a draw replays and escalates to a vanishing "sudden death" variant |
| 🔴 Vier gewinnt | `split-connect-four-dialog.tsx` | 7×6 drop board, classic Connect Four rules; a draw (rare) just replays |
| 🧠 Memory-Duell | `split-memory-dialog.tsx` | 9 pairs (18 cards) — an odd pair count makes an exact tie impossible |
| ⚡ Reaktionsduell | `split-reaction-dialog.tsx` | Both tap "ready", then race a random-delay "Los!" signal; an early tap is a false start |

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

## The knockout ladder: scaling a 1-vs-1 duel to any pool size

Tic-Tac-Toe, Vier gewinnt, Memory-Duell and Reaktionsduell are all fundamentally two-player
games, but the setup step (`GamePoolSetupStep`, shared with the luck games) still lets the
group pick any pool and any "how many should pay" count. `knockout-ladder.ts` is the pure state
machine that reconciles the two: it plays a **sequence of 1-vs-1 matches**, one at a time —
whoever loses a match is locked in as a payer and steps aside; whoever wins stays on the phone
and immediately faces the next challenger, drawn from a `secureShuffle`d order fixed at
`start()`. For a pool of exactly 2 that's just one match. The ladder always plays exactly
`targetLoserCount` matches, since every match produces exactly one loser — so "Duell n von k"
(`DuelLadderStrip`) is known up front, not dependent on how many challengers are left in the
queue.

`useKnockoutLadder` (`use-knockout-ladder.ts`) is the React wrapper — the duel equivalent of
`useSequentialDraw` above — exposing `current` (the match to play right now), `losers` (which
is exactly the `loserUids` shape `onResolve` expects), and `reportWin`/`reportDraw` for a board
to call once a match is decided. Only the *pairing order* is randomized (crypto-shuffled, same
reasoning as the luck games — who plays whom first must not be gameable); a match's actual
outcome is never randomized, since these are skill games.

A **draw** (Tic-Tac-Toe, Vier gewinnt, and Reaktionsduell's "too close to call") replays the
same match with the players swapped (`recordDraw`), so whoever went second starts this time.
Memory-Duell can't draw at all — see below.

## `DuelGameDialog`: the shared shell for all four duel games

`src/components/groups/split-game/duel-game-dialog.tsx` is what `split-wheel-dialog.tsx` is to
the wheel: every duel game mounts `<DuelGameDialog config={...} />` with a `Board` component and
three translation keys (emoji, title, intro) — the shell owns the setup step, the ladder, the
handoff card between matches (`DuelHandoffCard`, "Gebt das Handy an X und Y — Y fängt an"), the
shared win celebration (`CatchFlash`, reused from the luck games' "caught!" takeover), and the
final `GameResultBanner`. Each game only has to implement **one match's board** and call
`onWin(winnerUid)` / `onDraw()` — it never touches setup, handoff, celebration, or the ladder
itself. The board is remounted (via React `key`, keyed off the ladder's per-match/per-attempt
pairing key) for every new match and every draw replay, so a board's internal state never has to
be reset by hand.

Per-game notes:

- **Tic-Tac-Toe** (`tic-tac-toe.ts` + `tic-tac-toe-board.tsx`) — classic rules can force a draw
  between two competent players, which a knockout ladder can't tolerate (every match needs a
  loser). The first draw replays as-is; from the *second* draw onward
  (`TIC_TAC_TOE_SUDDEN_DEATH_ATTEMPT`), the match switches to a "vanishing" variant: once a
  player has three marks down, placing a fourth removes their oldest one first. That shrinks the
  state space enough that the match reliably resolves, while staying pure skill.
- **Vier gewinnt** (`connect-four.ts` + `connect-four-board.tsx`) — standard 7×6 rules. A full
  board with no line (rare) just replays; no escalation needed.
- **Memory-Duell** (`memory-duel.ts` + `memory-board.tsx`) — 9 pairs (`MEMORY_PAIR_COUNT`), not
  an even number. That's deliberate: it makes an exact tie between the two players' pair counts
  mathematically impossible, so the match never needs a draw/replay rule at all —
  `memoryOutcome` decides the instant one player passes the majority.
- **Reaktionsduell** (`reaction-duel.ts` + `reaction-board.tsx`) — both players tap their half of
  the screen when ready; after a random delay (`REACTION_MIN_DELAY_MS`–`REACTION_MAX_DELAY_MS`)
  a "Los!" signal appears. A tap before the signal is a false start (instant loss); the faster
  *valid* tap otherwise wins. Taps within `REACTION_TIE_WINDOW_MS` of each other can't be
  honestly ordered by touch hardware, so `judgeReaction` calls it "too close" and the shell
  replays the match — this is the one duel game where a draw doesn't mean incompetence, just
  hardware precision.

## Turniermodus: a live, parallel bracket for the duel games

Added after the ladder: an opt-in "Turnier" toggle in `DuelGameDialog`'s setup step,
shown for a pool of 3 or more when `DuelGameConfig.tournament` is `true` — currently only
Vier gewinnt (`split-connect-four-dialog.tsx`), while the claim/takeover/cancel machinery
gets real use before the other three duel games get it too. The ladder stays the default
and is completely untouched by this.

The ladder's "winner stays on" chain only ever has one match in flight — great for one
shared phone, useless for "10 people, several games at once." A tournament is a real
bracket instead: matches within the same round are structurally independent, so different
pairs can claim and play their own match on their own phone at the same time, while
everyone — including people not currently playing — watches the whole tree update live.
See ADR-002 (`docs/DECISIONS.md`) for why this needed a new Firestore collection
(`groups/{groupId}/tournaments/{tournamentId}`, one small document per bracket — see
[[Data Model]]) where the ladder never did: the ladder's state never needs to outlive one
device's one sitting, a live cross-device bracket does.

### The bracket engine (`lib/games/tournament-bracket.ts`)

Pure, deterministic, no randomness and no `Date.now()` inside — same discipline as
`knockout-ladder.ts` — so `createBracket`/`recordMatchResult`/etc. are fully covered by a
property-based Vitest suite (every pool size 2..32 × every possible "how many should pay"
count) rather than hand-picked examples. `lib/actions/tournaments.ts` is a thin,
transaction-wrapped Server Action layer around it; the client only ever reports "match X's
winner is Y" — the server decides who advances and when the bracket is finished, inside a
Firestore transaction, the same trust boundary every money-adjacent write in this app
already has (see [[Data Access Pattern]]).

**Bracket shape.** The pool splits into one or more independent "trees" (contiguous chunks
of a server-shuffled order), each a balanced binary tree of matches built by recursively
halving the entrant list at the even size nearest half (a lone leftover entrant is a bye,
free-advancing to its parent match). This shape is identical regardless of who "should"
advance — that part is decided only when a result comes in.

**Who pays picks itself**, from how many people should pay (`targetLoserCount`) relative to
the pool:
- `targetLoserCount <= poolSize / 2` → **`"loser"` mode** ("Verlierer spielt weiter"): a
  match's winner is safe and done; the loser keeps playing. The pool splits into
  `targetLoserCount` trees, and each tree's *final* loser pays — so everyone plays at
  least once, unlike the ladder, where a low target count can leave most of the pool never
  playing at all.
- `targetLoserCount > poolSize / 2` → **`"winner"` mode** (classic single-elimination): a
  match's loser is immediately locked in as a payer; the winner advances. The pool splits
  into `poolSize - targetLoserCount` trees, and each tree's champion goes free.

Both modes use the exact same tree shape and always produce exactly `targetLoserCount`
payers — only `recordMatchResult`'s interpretation of a result differs.

### Claim, play, report — never move-by-move sync

A match's two players still share one phone to play it — the same handoff-card UX the
ladder already has (`DuelHandoffCard`, reused as-is). What's new is that a device first
**claims** a ready match (`claim: {byUid, claimId, claimedAt}`) before playing it; only the
device holding the current `claimId` can report that match's result. A draw replays
entirely locally (players swap, same as the ladder) and never touches the server — only
the final winner and how many tries it took are ever reported.

**Takeover** is the one mechanism behind "that phone's tab got closed" and "this match is
stuck": any device can re-claim an already-claimed match, which issues a fresh `claimId`
and silently invalidates the old one (a stale device's next report gets `claim-lost`).
Deliberately in scope from the first version — without it, one closed tab blocks the whole
tournament from ever finishing.

**Explicitly out of scope:** syncing individual moves between two phones in different
rooms. The ask was parallel *pairs*, not remote 1-vs-1 play — see ADR-002's "what would
make us reverse this" for what a real remote-play version would need instead.

### Where it lives on screen

- Inside the game dialog itself (`DuelGameDialog` → `TournamentView`) on whichever device
  started it — closing the dialog does **not** cancel the tournament or lose its id;
  reopening the same game shows the same live bracket again.
- `/groups/[groupId]/tournaments/[tournamentId]` (`TournamentPageClient`) — the route every
  other player and spectator uses, reached from a `TournamentBanner` card on the group page
  or a shared link. Falls back to the tournament's own `entrants` snapshot for a uid the
  live group doc no longer has a member for.
- `BracketView` draws the tree as rounds-in-columns per tree, each match card showing both
  players and, once decided, who's safe/advancing/paying — driven by the same `advance`
  field the engine uses, so the drawing and the payout logic can never disagree.

Applying a finished tournament's result to an actual expense (`onResolve(loserUids)` →
`viaLottery = true`, exactly like every other split game) currently only happens from
inside the `AddExpenseDialog` that created it — the standalone page is for watching and
playing, not for entering the expense. See ADR-002 for why that fallback was deferred
rather than guessed at.

## The picker: two categories and a preview step

`SplitGamePickerDialog` used to be a flat 2×2 tile grid that handed off straight into a game's
setup step — testers found that jump from "tap a tile" to "a popup with a member checklist"
unclear. It's now a two-step flow, driven entirely by one table
(`split-game/game-catalog.ts`, `SPLIT_GAMES` + `SPLIT_GAME_CATEGORIES`):

1. **Grid** — two labeled sections, "Glücksspiele" and "Minispiele", each with a one-line
   category blurb and the familiar emoji/name/blurb tiles.
2. **Preview** (`SplitGamePreview`, `game-preview.tsx`) — tapping a tile doesn't start the game;
   it shows the game's name, a longer "So funktioniert's" paragraph (`howKey` per game in the
   catalog), and — for every skill game — a callout explaining the knockout-ladder behavior for
   pools bigger than two. "Los geht's" then hands off to that game's own dialog exactly as
   before; "Zurück" (or Escape) returns to the grid.

Adding a ninth game later means adding one row to `SPLIT_GAMES` plus its translation keys — the
picker itself doesn't change.

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
member's wheel wedge/reel color and their avatar chip always agree. `duelPalettes(nameA, nameB)`
extends this for the four duel games: each player's own `memberColor`, except when both names
hash to the same slot (a duel where both marks look identical is unreadable), in which case the
second player is bumped to the opposite side of the palette wheel.

## The `viaLottery` flag, now shared

All eight games set `Expense.viaLottery = true` when their result is applied — the field name is
a holdover from when the lottery was the only game (see [[Data Model]]), but its actual meaning
has always been closer to "resolved via a split mini-game", so the existing
`computeLotteryTotals` / `LotteryOverview` leaderboard already aggregates across all eight games
with zero code changes needed. Renaming the field would mean migrating live Firestore data for
a purely cosmetic win, so it stays `viaLottery`. One side effect worth knowing: the leaderboard's
title ("Wer hat wie viel vergambelt?") now also counts skill-game losses, which reads slightly
oddly for a game of pure competence — a wording nuance, not a bug, and out of scope to fix here.

## Related
[[Split Lottery]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Design System and Theming]]
· [[Local Development and Testing]] · [[Data Model]] · [[Firestore Rules]] · [[Routing Map]]
