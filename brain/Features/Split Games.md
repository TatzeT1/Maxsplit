---
tags: [feature, split-games, fun]
---

# Split Games (🎲🎡🎰🎫🎈🦆🥃🎱 · ⭕🔴🧠⚡✊🥢✏️)

Picker: `src/components/groups/split-game-picker-dialog.tsx`. Shared "luck" engine:
`src/lib/games/` (`use-sequential-draw.ts`, `random.ts`, `member-colors.ts`) and
`src/components/groups/split-game/` (`game-pool-checklist.tsx`, `game-pool-setup-step.tsx`,
`game-result-banner.tsx`, `game-progress-pips.tsx`, `game-avatar.tsx`, `scratch-card.tsx`).
Shared "skill" engine (the seven duel games — see below): `src/lib/games/knockout-ladder.ts` +
`use-knockout-ladder.ts`, `src/components/groups/split-game/duel-game-dialog.tsx` (the shell),
`duel-ladder.tsx`, `duel-turn-banner.tsx`. Picker data: `split-game/game-catalog.ts` +
`game-preview.tsx`. Sound: `src/lib/sound/game-sounds.ts`. The seven games of the second batch
(ballon, ducks, dice cup, pegboard, rock-paper-scissors, Nim, dots and boxes) are described in
[[#The second batch: seven more games (2026-10)]]; fairness, statistics, rematch, nudges and
the online scratch cards in [[#Round three: fairness, record, rematch, online luck (2026-10)]];
the per-payer catch moment with the amount on the slip in
[[#Round four: polish for the luck games, a luck index, a new game (2026-10)]].

## What it is

A family of gamified alternatives to manually choosing a split, all reachable from the same
"🎮 Spiel" button in `add-expense-dialog.tsx`: tapping it opens `SplitGamePickerDialog`, a
two-category tile picker (see [[#The picker: two categories and a preview step]]), which hands
off to one of fifteen game dialogs. Every game is, like [[Split Lottery]] before it, purely a
**front-end input mechanism** that flows through the same `resolveExpense` / `buildSplits`
pipeline as a manually-entered split (see [[Expenses and Splitting]]) — none of them bypass or
duplicate the money-invariant logic. All of them but the slot machine resolve to a plain list
of "loser" uids that `add-expense-dialog.tsx` turns into an equal exact split via `splitEqual`.
The slot machine is the exception — see below.

The fifteen games split into two categories, each with its own resolution engine:

| Category                | Games                                                                                                                                  | How "who pays" is decided                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Glücksspiele** (luck) | 🎲 Lottery, 🎡 Wheel, 🎰 Slot, 🎫 Scratch, 🎈 Ballon, 🦆 Entenrennen, 🥃 Würfelbecher, 🎱 Kugelfall                                    | A crypto-random draw — `useSequentialDraw`, or the game's own hidden-odds engine (slot, balloon, dice) |
| **Minispiele** (skill)  | ⭕ Tic-Tac-Toe, 🔴 Vier gewinnt, 🧠 Memory-Duell, ⚡ Reaktionsduell, ✊ Schnick-Schnack-Schnuck, 🥢 Streichholz-Duell, ✏️ Käsekästchen | A 1-vs-1 duel, scaled to any pool size by a knockout ladder — see below                                |

| Game                       | Dialog                          | Mechanic                                                                                        |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| 🎲 [[Split Lottery]]       | `split-lottery-dialog.tsx`      | Tap-to-reveal grid, turn-based, up to 32 anonymous faces                                        |
| 🎡 Glücksrad               | `split-wheel-dialog.tsx`        | Spin a wheel of the remaining pool; the needle picks the loser                                  |
| 🎰 Spielautomat            | `split-slot-dialog.tsx`         | Turns at one machine; symbol combos from a paytable decide who pays how much                    |
| 🎫 Rubbellos               | `split-scratch-dialog.tsx`      | Everyone scratches their own card; whoever gets a blank pays                                    |
| ⭕ Tic-Tac-Toe             | `split-tic-tac-toe-dialog.tsx`  | 3×3 grid, alternating marks; a draw replays and escalates to a vanishing "sudden death" variant |
| 🔴 Vier gewinnt            | `split-connect-four-dialog.tsx` | 7×6 drop board, classic Connect Four rules; a draw (rare) just replays                          |
| 🧠 Memory-Duell            | `split-memory-dialog.tsx`       | 9 pairs (18 cards) — an odd pair count makes an exact tie impossible                            |
| ⚡ Reaktionsduell          | `split-reaction-dialog.tsx`     | Both tap "ready", then race a random-delay "Los!" signal; an early tap is a false start         |
| 🎈 Ballon                  | `split-balloon-dialog.tsx`      | Pump 1–3× per turn against a secret burst point; whoever's pump pops it pays                    |
| 🦆 Entenrennen             | `split-duck-race-dialog.tsx`    | Everyone is a duck, the race plays a pre-drawn order; the last duck across the line pays        |
| 🥃 Würfelbecher            | `split-dice-dialog.tsx`         | Two dice each, Mäxchen ranking, lowest pays; ties on the line roll off ("Stechen")              |
| 🎱 Kugelfall               | `split-pegboard-dialog.tsx`     | A ball bounces down a pegboard into the pre-drawn payer's slot; the slot is then plugged        |
| ✊ Schnick-Schnack-Schnuck | `split-rps-dialog.tsx`          | Hidden simultaneous hands, first to two round wins; a drawn round replays                       |
| 🥢 Streichholz-Duell       | `split-nim-dialog.tsx`          | Misère Nim on 1·3·5·7 under a shrinking fuse, with one joker each — last match loses            |
| ✏️ Käsekästchen            | `split-dots-dialog.tsx`         | 4×4 dots, 9 boxes (odd — no tie); closing a box earns another move                              |

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

## The slot machine: a paytable, played in turns

Rules: `src/lib/games/slot-machine.ts` (pure, tested in `slot-machine.test.ts`). Dialog:
`split-slot-dialog.tsx`. Pieces: `split-game/slot-parts.tsx` (reel symbol, paytable, tally with
badges, award show). Effects: `split-game/slot-fx.tsx`. Changed 2026-10. Before that it was a
single "whose face do the reels land on" draw: with two players that was a 50/50 coin flip every
spin, and the reels showed avatars instead of symbols.

The slot machine does **not** sit on `useSequentialDraw`. It isn't "pick N distinct losers
once", it's a one-armed bandit. Everyone takes turns at one machine, in an order
`secureShuffle`d once at the start, and pulls **three times in a row**
(`SLOT_SPINS_PER_TURN`) before passing the phone on. Every pull draws a combination and its
extras (`drawSlotSpin`, crypto-random through the `SlotRandom` the dialog passes in), and the
combination decides what happens to the bill. The table lists odds per pull; E = the stake:

| Reels                      | Odds | Effect                                                                   |
| -------------------------- | ---- | ------------------------------------------------------------------------ |
| No match (Niete)           | 40 % | Spinner pays E (nothing on a free spin); feeds the jackpot               |
| Two of a kind              | 22 % | Stake back, nobody pays; can be held (see below)                         |
| 🍋🍋🍋 Sauer!              | 6 %  | Spinner pays 3E                                                          |
| 🍒🍒🍒 Freispiele          | 5 %  | 3 free spins, played straight away, on top of the series                 |
| 🔔🔔🔔 Schwarzer Peter     | 4 %  | The next player in line pays 2E                                          |
| ⭐⭐⭐ Runde geht auf euch | 4 %  | Everyone else pays E                                                     |
| 🍀🍀🍀 Glücksklee          | 3 %  | The spinner picks who pays 2E                                            |
| 🧾🧾🧾 Die Rechnung        | 3 %  | Everyone still in, the spinner included, pays E                          |
| 🎡🎡🎡 Bonusrad            | 3 %  | A wheel of eight prize segments (`SLOT_WHEEL_SEGMENTS`)                  |
| 🎁🎁🎁 Geschenkbox         | 3 %  | The spinner opens one of three boxes, each holding a wheel prize         |
| ⚔️⚔️⚔️ Duell               | 2 %  | The spinner picks an opponent; the weaker duel reel pays 3E              |
| 👻👻👻 Geistertausch       | 2 %  | The spinner's tally swaps with a random other player's                   |
| 💣💣💣 Bombe!              | 2 %  | Spinner pays 5E                                                          |
| 777 Jackpot                | 1 %  | Refund of all the spinner paid, they are out, the others pay the jackpot |

**Prizes** (wheel and gift boxes): everyone else pays 2E, the spinner pays 3E, a 🛡️ shield
(the holder's next own loss is struck off), +5 free spins, or a ⚡ boost (the holder's next three
pulls count double).

On top of the table:

- **💎 Wild.** One in five of the three-of-a-kinds in `SLOT_WILD_KINDS` shows a wild on one reel
  and doubles what the combination does, good or bad. It never comes with the ghost, the wheel,
  the gift or the jackpot.
- **📈 Progressive jackpot.** Every paid no-win adds half a stake to `jackpotPotMinor`. On 777
  the others pay it, split evenly, unless only one player is left: they pay the rest of the bill
  anyway.
- **🪙 Coins and the multiplier.** On a free spin, each reel has a 25 % chance of a coin above
  or below the payline, worth 1×, 2× or 5× the stake. The coins count at
  `freeSpinMultiplier`, which goes up by one with every free spin (×1, ×2, ×3 …, capped at
  ×5). They go into `coinPotMinor`, and when the free spins run out everyone else pays the pot,
  split evenly.
- **✋ Halten.** After a pair on a regular pull, with the series still going, `state.hold`
  offers one respin of the odd reel per series (`applySlotHold`). It doesn't use up a pull.
  With `SLOT_HOLD_CHANCE` (25 %) it completes the three-of-a-kind, good or bad: a held pair of
  sevens can become the jackpot.
- **🎲 Risiko.** After a paid loss on a regular pull, `state.gamble` offers double or nothing on
  that charge (`drawSlotGamble`), up to `SLOT_GAMBLE_MAX_STEPS` times. It is fair in
  expectation.
- **Decisions block the machine.** The clover, the duel and the gift set `state.pending`, and
  the turn doesn't pass until it's resolved (`applySlotChoice`, `applySlotGiftPick`). That way
  a gift's free spins still go to the person who pulled it.
- **🔥 Streaks.** `state.streaks` counts wins in a row up and no-wins in a row down. After
  `SLOT_PITY_AFTER` (4) no-wins in a row, the next pull draws from the paytable without the
  no-win.
- **Fairness.** Everyone gets the same series and the same options, so the game is fair in
  expectation. A Monte-Carlo test plays whole games with random picks, gift boxes, holds and
  Risiko presses and checks that every seat ends up paying about the same share.
- **Exact total.** Every move goes through one capped ledger (`workOn`: `charge`, `refund`,
  `splitAmong`), so the tallies always end on exactly `amountMinor`, never below zero.
- **Stake.** The setup step offers a game length, Kurz / Normal / Lang (1 / 2 / 3 series of
  three per person). `slotStakeForDuration` divides the bill by the regular pulls and by
  `expectedStakesPerTurnSpin` (wilds, prizes, free spins and their coins included), then rounds
  to a coin-like amount. "Eigener Einsatz" still takes a typed stake.
- **Decide first, animate after.** `slotReelFaces` builds faces that show the drawn outcome.
  When the first two reels match, the third gets a longer, drum-rolled spin. Filler symbols,
  and which payline symbols hide behind a ❓ mystery tile before turning over
  (`pickMysteryReels`), are `Math.random` and purely decorative.

### Presentation, modelled on online slots

- **The machine is the whole screen**, not a box inside the game. While it plays,
  `GameDialogContent` gets `frameClassName` with a dark casino gradient (`dark` class, so the
  sticky title bar and control deck turn dark too), whatever the app's theme.
  - `useFirstScreen` measures the height between the sticky title bar and the control deck
    (a `ResizeObserver` on the `data-slot="stage-scroller"` scroller, header and footer). The
    stage takes exactly that as its `minHeight`: who is at the machine and the bill's progress
    at the top, the cabinet centered, "Mehr Infos ↓" at the bottom.
  - The reels size off the window (`useReelGeometry`): a third of the column wide, as tall as
    the leftover height allows, at most 1.2× their width. Cream paper, so the symbols pop on
    the dark cabinet.
  - Tallies, paytable and, at the end, the award show sit _below_ the first screen. A scroll
    or the "Mehr Infos" / "Zur Preisverleihung" button gets there. Any pull scrolls back up
    (`showMachine`).
  - Scroll with `scroller.scrollTo`, never `scrollIntoView`. That also scrolls the
    `overflow-x-hidden` scroller _sideways_, shoving the whole stage left.
  - The light rays behind the cabinet sit in a clipping span the size of the first screen. An
    unclipped `180vmax` sunburst made the scroller far taller than its content.
  - Every overlay (takeovers, decisions, reveals) lives in one `fixed` layer above the title
    bar and the deck, below the ✕. It sits _outside_ the stage, because the impact shake
    transforms the stage, and a transformed ancestor would trap a fixed child. The layer is
    `pointer-events-none` unless an overlay is up.
  - The lever is gone. The deck is the LED panel, Halten/Risiko when offered, and round
    toggles (⚡ 🔁 🔊) around one big "Drehen" pill.
- **On the cabinet:**
  - A red-on-black progressive jackpot marquee (`JackpotMarquee`).
  - Marquee bulbs (`BulbRow`).
  - An LED panel (`LedPanel`): stake, spin 1/3 and the last result; during free spins, the
    free spins left, the pot and the multiplier.
  - During free spins it turns gold and fizzes (`AmbientBubbles`). Coins (`CoinChip`) land on
    the reels and fly into the pot.
- **On every combination:** a glowing line through the payline (`WinLine`), gold for good news
  and red for bad. The symbols in the combination pulse while the rest dim. Amounts float up
  as bubbles (`FloatingBubbles`).
- **Takeovers, queued** (`present`/`advance`), after the line has shown:
  - A stamped slip (`CatchFlash`) for costly results: lemons, bombs, a clover pick, a lost
    duel, and the pull that finishes the bill.
  - A tiered casino banner (`SlotWinBanner`) for the other three-of-a-kinds: a gold or red
    title on a rotating `Sunburst`, amounts rolling up (`RollupMoney`) and a coin fountain.
  - The bonus wheel (`BonusWheel`): an SVG wheel that ticks to the drawn segment.
  - MÜNZTOPF when the coin pot pays out.
- **Decision overlays:**
  - Avatar buttons for the clover and the duel pick.
  - `DuelReveal`: two single reels landing on the drawn symbols.
  - `GiftPicker`: three wobbling boxes. The chosen one opens first, then the others.
  - `GambleFlip`: a 3D coin for Risiko.
  - Halten is a footer button. The held reels show "Gehalten", and the odd one respins under a
    drum roll.
- **Deck toggles:**
  - ⚡ Turbo runs every timing at 40 %.
  - 🔁 Auto-Serie pulls the rest of the series and stops at decisions, at a turn change and at
    the end. It is driven by an effect plus `useEffectEvent`.
  - 🔊/🔇 is the games' global mute (`setGameSoundsMuted` in `game-sounds.ts`).
  - Turbo is remembered per browser in `localStorage`; sound is the games' shared setting
    (see [[#Round three: fairness, record, rematch, online luck (2026-10)]]) — while the reels
    run the slot shows it on its deck, so the stage's corner switch is hidden there.
  - Big moments buzz on Android via `navigator.vibrate`. iOS ignores it.
- **Badges** (`PlayerBadges`): 🔥 after three wins in a row, 🌧️ after three no-wins, 🛡️ for a
  shield, ⚡×2 for a boost.
- **Award show** (`SlotAwards`) once the bill is allocated: Glückspilz, Pechvogel, the hardest
  single hit, the Risiko king and the jackpot heroes, as cards under a confetti burst.
- **Reduced motion:** the reels finish in the same tick, so `handleReelStop` counts stops in a
  ref (`spinRef`), not in state. With state each callback would see stale stops, and the game
  would hang after the first pull.

Because different people can end up owing different amounts, `SplitSlotDialog`'s `onResolve`
takes `Record<uid, amountMinor>` directly rather than the other games' `loserUids: string[]`.
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
to call once a match is decided. Only the _pairing order_ is randomized (crypto-shuffled, same
reasoning as the luck games — who plays whom first must not be gameable); a match's actual
outcome is never randomized, since these are skill games.

A **draw** (Tic-Tac-Toe, Vier gewinnt, and Reaktionsduell's "too close to call") replays the
same match with the players swapped (`recordDraw`), so whoever went second starts this time.
Memory-Duell can't draw at all — see below.

## `DuelGameDialog`: the shared shell for all duel games

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
  loser). The first draw replays as-is; from the _second_ draw onward
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
  _valid_ tap otherwise wins. Taps within `REACTION_TIE_WINDOW_MS` of each other can't be
  honestly ordered by touch hardware, so `judgeReaction` calls it "too close" and the shell
  replays the match — this is the one duel game where a draw doesn't mean incompetence, just
  hardware precision.

## Turniermodus: a live, parallel bracket for the duel games

Added after the ladder: an opt-in "Turnier" choice in `DuelGameDialog`'s setup step
(`DuelModePicker` — two cards, one phone vs. several; the tournament card is disabled below a
pool of 3, and "Start" falls back to the ladder then) when `DuelGameConfig.tournament` is
`true` — now on for all
four duel games (shipped for Vier gewinnt first, then turned on for the other three once
the claim/takeover/cancel machinery held up). Turning it on for a game is a one-line config
change in that game's own `split-*-dialog.tsx` wrapper, not new code, because every board
already speaks the same `DuelBoardProps` contract (`players`, `members`, `attempt`, `locked`,
`onWin`, `onDraw`) that `TournamentMatchRunner` drives — the same one the ladder already
used, so a board never knows or cares which mode is running it. The ladder stays the
default and is completely untouched by this.

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
  `targetLoserCount` trees, and each tree's _final_ loser pays — so everyone plays at
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

Local matches still work exactly this way. Remote play — two phones, different rooms —
came later as its own mode; see [[#Online play: every player on their own phone]].

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
  field the engine uses, so the drawing and the payout logic can never disagree. The
  viewer's own undecided match is tagged "Dein Match" and scrolled into view; a fade plus a
  "Wischen für mehr" hint marks a tree wider than the screen.

`TournamentView` is ordered by what a person needs first, not by data type: a slim progress
strip (round, "x von y Matches gespielt", share link), then one "what about me?" card
(`YourStatusCard` — your match to play, running elsewhere, who you're waiting on, or
safe/pays), then other playable and live matches, and only then the bracket (with the mode's
rule sentence and a legend) and grouped standings. Every per-person reading of the bracket —
"safe", "pays", "plays on", where an entrant stands right now — comes from
`lib/games/tournament-status.ts`, a pure restatement of the engine's own rules that's tested
against `bracketLoserUids` at every step of every pool size, so the screen can't tell someone
they're safe while the payout makes them pay. Safe is green, pays is red, and orange stays
reserved for "ready / yours / act now"; `tournament-fate.tsx` keeps icon, color and label
for each of those in one place.

A tournament started from a **new** expense books that expense by itself when it finishes
(`autoBook`, see below). One started while _editing_ an expense still hands its result back
to the dialog (`onResolve(loserUids)` → `viaLottery = true`), since an edit can't be
booked blind.

## Online play: every player on their own phone

ADR-003. The setup step asks two things: **"Wo spielt ihr?"** (`DuelPlacePicker`: "Auf
einem Handy" / "Online") and, only on one device with 3+ people, the **format**
(`DuelModePicker`: K.-o.-Leiter / Turnier). Online is always a bracket — a 1-vs-1 online
duel is simply a tournament with one match (`playMode: "online"`), so it reuses the
banner, the page, the share link and the bracket engine unchanged. Online is offered only
when adding a new expense (it auto-books) and with ≥2 pool members who have an account.

- **Moves are server-validated.** `playOnlineMove` runs `applyOnlineMove`
  (`lib/games/online-match.ts`, pure, unit-tested) inside a transaction — the exact rule
  modules the one-phone boards use, plus turn order and validation. A modified client
  can't move out of turn, flip a card it can't see, or report a win the board doesn't
  show; `reportTournamentMatchResult` and `claimTournamentMatch` refuse online matches.
  The deciding move records the bracket result in the **same transaction**.
- **Boards are shared.** `TicTacToeGrid`, `ConnectFourGrid`, `MemoryGrid` were pulled out
  of the local boards as stateless views; `online-boards.tsx` drives them from the live
  doc, so both modes look identical. The two grid games lay the viewer's own move over the
  snapshot optimistically (`OnlineMatchRunner`) so a tap never feels laggy.
- **Memory's deck is secret** (`liveSecrets`, unreadable by rules); a mismatch stays face up
  until the next flip, with a short local grace lock so the next player sees both cards.
  Schnick-Schnack-Schnuck keeps its locked-in hands there too, and is the one game whose moves
  change the secret — see [[#The second batch: seven more games (2026-10)]].
- **Reaktionsduell measures on each phone.** The server draws the delay once both are
  ready; each phone counts it down itself, shows "Los!", and reports its own reaction time
  (or a false start). Network lag therefore never decides who was faster — the trade-off is
  trusting the other phone's clock, acceptable between friends. A phone that never taps
  reports `REACTION_ONLINE_TIMEOUT_MS` so the match can't hang.
- **Placeholders** have no phone: a match with one plays locally on its opponent's phone
  via the old claim flow (`isOnlineMatch` decides per match).
- **"Spiel starten" — a duel without an expense form.** `StartGameButton` (Spiele tab + group
  page) opens `StartGameDialog`: pick one of the seven duels, who plays (real members only) and an
  optional stake (default 0 €). Always online, always a bracket. **Stake 0** → `autoBook: null`,
  nothing is booked ("verliert" instead of "zahlt" via `TournamentStakeProvider`; a finished
  free game shows "nichts zu verrechnen"). **Stake > 0** → `autoBook` with `payerIsWinner: true`
  (`paidBy: {}`) and `targetLoserCount = pool − 1`, so exactly one player is left standing;
  `applyBracketUpdate` books the expense with the **winner as payer** and the losers splitting it
  (`buildGameExpense({ winnerUid })`). `createTournament` rejects a `payerIsWinner` draft with any
  other loser count. If the winner left the group meanwhile, `autoBookError` says so.
- **The banner tells the truth about turns.** `TournamentBanner` reads the player's live board
  (`useLiveMatch(..., { resync: false })`): "Du bist dran!" only when it really is their move
  (or a fresh, unopened match); otherwise "Warte auf X …".
- **Chat under the board.** `MatchChat` (`online/match-chat.tsx`) shows the latest group messages
  and a composer below every online match — same `messages` collection as [[Chat]], so nobody
  leaves the game to talk. Marks the chat read; offline it can't send.
- **Moves arrive fast, and a stalled listener heals itself.** Firestore uses
  `experimentalAutoDetectLongPolling` (buffering mobile networks/proxies delayed the stream), and
  `useLiveMatch` backstops the listener with a `getDocFromServer` every 3 s while the match is
  undecided, plus on `visibilitychange`/`focus`/`online` — it only ever applies a higher `version`.
- **Forfeit** ("Aufgeben") ends your match as a loss — the escape hatch for "we're done".

**Auto-booking.** The `AddExpenseDialog` hands the game a `GameExpenseDraft` (description,
amount, date, category, emoji, payer — everything but the split); `createTournament`
validates it up front (`validateGameExpenseDraft`, `lib/money/game-expense.ts`) and
`applyBracketUpdate` writes the expense in the finishing transaction via
`buildGameExpense` — an exact split of `splitEqual` over the losers, `viaLottery: true`,
byte-for-byte what applying a result by hand produces. After "Herausfordern" the form
resets and closes and the app navigates to the game page, so the same bill can't be saved
twice. If a loser left the group meanwhile, nothing is booked and `autoBookError` says so.

**Invites.** Whoever turned push on gets a "Herausforderung" push, and then "Du bist dran"
when a match of theirs is waiting or the opponent moved — skipped while they watch the
game or the group page's banner (`useTournamentPresence`); see [[Push Notifications]].
For everyone else `createTournament` also posts a chat message with `gameInvite` (a join
card in the chat), the group banner says "X fordert dich heraus!", and the creator gets
`OnlineInviteCard` — a prefilled WhatsApp message (`wa.me`) plus copy link — until the
first move. Offline, game pages show "Dafür brauchst du Internet" ([[Offline Mode]]). Shared links go through `/play/[groupId]/[tournamentId]`,
which survives WhatsApp's cookie-less in-app browser by routing through sign-in.
One game runs per group at a time (unchanged `createTournament` rule).

## Loaded on demand

The picker and all fifteen game dialogs are lazy chunks (`split-game/lazy-dialogs.tsx`,
`next/dynamic`) — before 2026-09 they were static imports of `AddExpenseDialog`, so every
group page shipped every game. `AddExpenseDialog` mounts the picker, and each game, the first
time it's opened and then **keeps it mounted**: a duel game holds its running tournament
across close/reopen (see above), which unmounting on close would lose. A game's chunk is
prefetched when its tile's preview opens (`preloadSplitGame`, `split-game/game-loaders.ts`),
so "Los geht's" rarely waits; if it does, a non-blocking spinner shows.

Anything outside the game dialogs that only needs to _name_ a duel game (banner, chat invite)
uses `DUEL_GAME_META` (`lib/games/duel-game-ids.ts`), never `TOURNAMENT_GAME_CONFIGS`, whose
four boards would otherwise ride along into every group page — the tournament banner did
exactly that until 2026-09. Measured with the production build, the group page's up-front JS
went from 1337 to 1213 KiB (398 → 372 KiB gzip).

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

Adding another game later means adding one row to `SPLIT_GAMES` plus its translation keys (and, for the dialog, a `gameLoaders` entry and a mount in `add-expense-dialog.tsx`) — the
picker itself doesn't change. The id also goes into `SplitGameId` (`lib/types.ts`),
`SPLIT_GAME_IDS` and `SPLIT_GAME_META` (`lib/games/split-game-ids.ts`, emoji + name for
places that only name a game); a test pins catalog and meta to each other.

Above the grid sit "🎲 Überrasch mich" (a random game's preview, "Anderes Spiel" throws again)
and "Zuletzt gespielt" — the three games this group picked last on this device, which start
straight away without the preview (`readRecentGames`, `game-memory.ts`).

## The full-screen stage (2026-10)

Every game plays on the whole screen, not in a centered dialog card — the small card over the
dimmed group page felt like a tab inside the app rather than being _in_ the game.
`split-game/game-stage.tsx` holds it:

- `GameDialogContent` — drop-in for `DialogContent` in all nine game dialogs (the eight luck
  games and `DuelGameDialog`, which covers the seven duels). Same Radix dialog (focus trap,
  Escape, `onOpenChange`), rendered as a fixed `inset-0` frame with its own scroller: the
  `DialogHeader` sticks under the notch, the `DialogFooter` sticks above the home indicator,
  auto margins center the board between them, and a ✕ sits top right. Content is capped at
  `max-w-2xl` and centered, so desktop gets the same stage with a sensibly sized board. The
  picker and `StartGameDialog` stay ordinary dialogs — they choose a game, they aren't one.
- `GamePageStage` — the same frame for `TournamentPageClient` (online matches and brackets). It
  lays itself (`z-40`) over the `(app)` layout's sidebar and mobile header; its ✕ links back to
  the group.
- **Boards grow with the stage.** The frame sets `--game-board-h` (viewport height minus
  ~320px of chrome, `STAGE_CHROME_PX`). Grid boards cap their width at
  `min(<cap>, --game-board-h × aspect)` — width-bound on a phone, height-bound on a short or wide
  window — and fall back to their old pixel size where the variable is unset. Memory and the
  lottery flip to a **portrait layout** (3×6 cards, 4 columns of faces) on a portrait screen, so
  a phone's height goes to bigger cards instead of shrinking six across. Fixed-pixel figures (the
  wheel, the balloon) are wrapped in `StageScale`, a transform that scales them up to the room
  available (never below 1, at most 1.6×).
- On a phone the stacked footer's `flex-1` buttons would get a 0 height basis inside the
  column and collapse to a sliver; the stage resets them to `basis-auto` below `sm`.

## Shared UI pieces

- `GamePoolChecklist` — just the "who's playing" member checklist, used directly by the slot
  machine (no "how many pay" concept applies to it) and wrapped by `GamePoolSetupStep` for the
  games that also need a count.
- `GamePoolSetupStep` — `GamePoolChecklist` plus a 1..`maxLoserCount` stepper, for every luck
  game with a payer count (since round four the lottery too). Callers pass their own count-hint
  copy and stepper icon; everything else, including the `expenses.game*` translation keys, is
  shared.
- `GameResultBanner` — the final "X zahlt." verdict banner (`expenses.gameResultOne` /
  `gameResultMultiple`) used by every luck game but the slot (the lottery since round four),
  including the `aria-live` announcement — visible text alone isn't announced on arrival,
  that's the state change screen readers actually hear. With a `stake` it prints each payer's
  share under their face. The slot machine has its own result view (a per-person amount
  breakdown, not a single "X zahlt." sentence) since its losers can owe different amounts.
- `GameProgressPips` — the "N of target decided" dot row used by the wheel and scratch cards;
  callers choose what the target means. The slot machine shows a running allocated/remaining
  total instead, since it has no fixed target count.
- `GameAvatar` — the deterministic name-colored initial chip used everywhere a member needs a
  small face.

`src/lib/games/member-colors.ts` gives the wheel's wedges solid
colors keyed off the same name hash `avatarGradient` uses (`nameHash` in `lib/utils.ts`), so a
member's wheel wedge color and their avatar chip always agree. `duelPalettes(nameA, nameB)`
extends this for the duel games: each player's own `memberColor`, except when both names
hash to the same slot (a duel where both marks look identical is unreadable), in which case the
second player is bumped to the opposite side of the palette wheel.

## The `viaLottery` flag, now shared

All fifteen games set `Expense.viaLottery = true` when their result is applied (and since
2026-10 `Expense.game` — which game, who played, which attempt; see
[[#Round three: fairness, record, rematch, online luck (2026-10)]]) — the field name is
a holdover from when the lottery was the only game (see [[Data Model]]), but its actual meaning
has always been closer to "resolved via a split mini-game", so the existing
`computeLotteryTotals` leaderboard (now the group page's Spiele tab, `games-tab.tsx` — see
[[Group Page]]) already aggregates across all fifteen games
with zero code changes needed. Renaming the field would mean migrating live Firestore data for
a purely cosmetic win, so it stays `viaLottery`. One side effect worth knowing: the leaderboard's
title ("Wer hat wie viel vergambelt?") now also counts skill-game losses, which reads slightly
oddly for a game of pure competence — a wording nuance, not a bug. Wins and losses of the duels
themselves have their own section in the Spiele tab since 2026-10 (the duel record).

## The second batch: seven more games (2026-10)

Four more luck games and three more duels, picked to feel different from each other and from the
first eight (a race to watch, a push-your-luck game, a dice roll with tie-breaks, a ball drop;
a hidden-hand duel, Nim, dots and boxes). They plug into the same contracts as before — luck
games `onResolve(loserUids)`, duels `DuelBoardProps` plus the shell's ladder, tournament and
online modes — so the picker, the money pipeline and the leaderboard needed no changes. Each
game keeps its rules in a pure, unit-tested module in `src/lib/games/` and the dialog only
stages them. Shared bits: `use-game-pool-setup.ts` (the pool + payer-count state every luck
dialog used to repeat) and the new synthesized sounds in `game-sounds.ts`. The luck games keep
one person dry: at most `poolSize - 1` payers (since round four the wheel, lottery and scratch
cards too — see [[#Everyone but one]]).

Tile art is `public/game-tiles/<name>.jpg`. Everything _inside_ the games is SVG/CSS — the
pegboard, the dice pips, the balloon, the ducks, the dot grid — with emoji for the three
hands, so a game never waits on an image. 🥃 is the dice cup's emoji because 🎲 already belongs
to the lottery.

The seven new tiles were generated as one 3×3 sheet (flat magenta gutters, two empty cells) and
cut apart, which keeps the set stylistically uniform; each is a ~390 px square, plenty for the
64/128 px the picker shows them at. To add a tile: cream background, thick dark-brown outlines,
hero scene centred, and nothing important in the bottom-right quarter — `GameTileImage`'s
emoji badge covers it.

### Luck games

- **🎈 Ballon** — `balloon.ts`, `split-balloon-dialog.tsx`, `balloon-figure.tsx`. Like the slot
  machine it does **not** sit on `useSequentialDraw`: who pays depends on how many times each
  person pumps (1–3 per turn, at least one before passing) and only the burst point is random —
  drawn with `randomInt` when the balloon is first blown up, range from `balloonBurstRange`.
  The balloon's size, wobble and face come only from `pumps / maxPumps`, never from the burst
  point, so nothing on screen leaks it. A popper drops out and the next balloon goes to the seat
  behind them; the pure module takes its randomness as a `BalloonRandom` argument.
- **🦆 Entenrennen** — `duck-race.ts`, `split-duck-race-dialog.tsx`, `duck-figure.tsx`. Decide
  first, animate after: the finishing order is one `secureShuffle`, the last _k_ ducks pay
  (`duckRaceLosers`). `planDuckRace` only stages it — finish times strictly increase with a
  minimum gap (`MIN_FINISH_GAP_SEC`), progress keyframes never go backwards and end on the line,
  so ducks overtake but the order cannot change. Tapping a duck quacks; it is cosmetic.
- **🥃 Würfelbecher** — `dice-cup.ts`, `split-dice-dialog.tsx`, `dice-figure.tsx`. Two dice per
  person, ranked like the pub game Mäxchen (`diceRank`: 21 beats everything, then the doubles
  66…11, then 65…31 by the bigger die first). The lowest roll pays; people level on the line
  between paying and not roll off again — only they do (`resolveDiceRound`, "Stechen") — so no
  payer is ever picked by seating order. `DiceGame` is the state machine, the dice are
  `randomInt(1, 6)` drawn the instant the cup is shaken. Since round four the table is live
  between rolls — see [[#Würfelbecher: live Zahlzone, "Schlag die 42!", Stechen]].
- **🎱 Kugelfall** — `pegboard.ts`, `pegboard-layout.ts`, `split-pegboard-dialog.tsx`. Sits on
  `useSequentialDraw`: the payers are fixed first, the ball's path is invented _backwards_ from
  the target slot (`planBallPath`, a random walk in half-slot columns that the walls and the
  remaining rows force to end there) and `ballFlight` turns it into keyframes and peg-click
  times. Slot order is an independent shuffle. The board holds 2–12 people
  (`PEGBOARD_MAX_SLOTS`); larger groups get a hint to use the wheel. The name avoids the trademark
  "Plinko".

### Duels

All three are tournament- and online-enabled from the start and use the shell unchanged.

- **✊ Schnick-Schnack-Schnuck** — `rock-paper-scissors.ts`, `rps-board.tsx`. First to two round
  wins; a drawn round just replays _inside_ the board, so the match never draws and `onDraw` is
  never called. One phone: split screen, a tap locks the hand instantly and shows only a padlock.
  Online: the hands stay in `liveSecrets/{matchId}.picks` until both are in — the public state
  only has `locked: [boolean, boolean]` and the revealed `rounds` (`{ p0, p1 }` objects: Firestore
  has no nested arrays). `applyOnlineMove` therefore returns an optional new `secret`, which
  `playOnlineMove` stores in the same transaction (`online-rps.emulator.test.ts` plays a whole
  match against the Firestore emulator and checks that no hand ever shows in the public doc).
  There are no turns (`liveTurn` is `null`), so the online runner shows no "Du bist dran" for it.
- **🥢 Streichholz-Duell** — `nim.ts`, `nim-board.tsx`, `use-turn-fuse.ts`. Misère Nim on 1·3·5·7:
  take any number from one row, whoever takes the last match loses, so no draw. Plain Nim is a
  solved puzzle — with perfect play the _second_ player wins, which almost nobody at a table knows,
  so for everyone else the first twelve moves feel arbitrary and nothing on screen says how close
  the end is. Two rules make the stakes visible:
  - **The fuse (Lunte).** A match burns down along the top of the board. Its length shrinks with
    the matches left (`nimFuseSeconds`: 15 s on a full board, 6 s once three or fewer remain), so
    the last moves are the hurried ones. It is lit by the first move. When it runs out, one match
    from a random open row is taken for the slow player (`nimLateMove`) and both screens say "Zu
    langsam!". The hook counts only visible time, so a phone put down doesn't come back to a spent
    turn; only the phone whose player is on the move acts on it, and it stands still offline.
  - **The joker.** Each player may once skip a move instead of taking (`NIM_JOKERS`), which hands
    the same position to the opponent — the one way to flip who is stuck with the last match, and
    nobody knows when the other will spend it. It ends in a joker duel over the last match: with
    one match left, whoever still holds a joker wins it. The brute-force solver in `nim.test.ts`
    shows the second player _still_ wins with perfect play, so nothing is skewed.
    Taking is one tap on the first match you want plus "Nehmen": the pick runs from there to the end
    of the row. A taken match flares off the board, the last match's head pulses, and a red glow
    creeps in once four or fewer are left. A match is stored as a flat list of small integers
    (`nim.ts` explains the codes): `row * 8 + count`, +32 when the fuse played it, 100 for a joker —
    so moves stored before the fuse and joker existed replay exactly as they did.
- **✏️ Käsekästchen** — `dots-and-boxes.ts`, `dots-board.tsx`. 4×4 dots make 3×3 boxes; nine is
  odd, so it cannot end level (the Memory-Duell trick). Closing a box earns another move —
  turns are therefore not strictly alternating, and online the match is the flat list of line
  numbers replayed through `replayDots`. Lines are numbered 0–23, the twelve horizontal first.
  Every line has a finger-sized (44 px) tap target laid over the SVG.

`NimGrid` and `DotsGrid` are views shared by the one-phone board and the online board, like the
grids of the first four duels (`NimGrid` owns only its current pick and the fuse's clock); the
online runner predicts the viewer's own move for them (open information), but not for the
hidden-hand game. `online-nim.emulator.test.ts` covers the joker and the late take against the
Firestore emulator.

## Round three: fairness, record, rematch, online luck (2026-10)

Seven improvements the owner picked from a list of ten (the other two — parallel games per
group with an inactivity timeout, and a "guess the bill" game — were not taken up).

### One sound switch for every game

`game-sounds.ts` owns "Ton aus": `isGameSoundsMuted()` reads `split:game-sound-off` from
storage on first use, `setGameSoundsMuted` writes it and notifies `subscribeGameSoundsMuted`
listeners; `useGameSoundsMuted` (`lib/sound/use-game-sounds-muted.ts`) is the
`useSyncExternalStore` hook. Every stage (`GameDialogContent`, `GamePageStage`) has a 🔊 corner
button next to the ✕ (`soundToggle={false}` drops it — the slot does while its deck shows its
own). Before, the stored setting was applied only once the slot machine had mounted, so after a
reload every other game played sound again.

### Games remember the last setup

`game-memory.ts`: per group and device (`localStorage`, try/catch), the pool and payer count
last _started_ (`rememberSetup` in every `startGame`) seed the next game's setup
(`readRememberedSetup`, trimmed to the current members, `null` below two). Shared across games:
four people at dinner are four people for the wheel and the dice alike.

### Fairness: "Neu mischen" is counted

Every luck game still ends with "Neu mischen" next to "Übernehmen" — what changed is that a
reshuffle shows. `AddExpenseDialog` provides a `GameRoundProvider`
(`split-game/game-round.tsx`); every game calls `startRound()` in its `startGame` (Neu mischen
included), and the stage shows "2. Versuch — steht später an der Ausgabe" from the second
round on (`GameRoundNotice`, ordered under the header with CSS `order`). The count resets with
the form (`resetForm`); an edit continues from the expense's own attempt, so replaying a game
while editing can't make it look like a first try. Only an online game started from the form
isn't counted — it books itself and can't be reshuffled.

### The game record on the expense

`Expense.game = { gameId, playerUids, attempt }`, sent by the form with `viaLottery` and
validated in `resolveExpense` (`normalizeExpenseGame`, `lib/games/expense-game.ts`: a known
game, members only, every payer among the players, attempt 1–999); auto-booked tournaments and
luck rounds write it via `buildGameExpense({ game })`. Forward-only like `viaLottery`; an edit
that replaces the split by hand stores `game: null`. Every game's `onResolve` therefore hands
back the pool too: `(loserUids, playerUids)` (the slot: `(amounts, playerUids)`). Shown as
`GameRecordSummary` ("Per Spiel entschieden: Glücksrad · im 2. Versuch") in the form and the
expense details.

### A result card in the group chat

`ChatMessage.gameResult` (`ChatGameResult`), built by `gameResultMessage`
(`lib/chat/game-result.ts`, one sentence shared by the stored text and the card): "Lea zahlt
„Pizza" (36,00 €) — im 2. Versuch", "Ben gewinnt gegen Lea", "Ben und Mia verlieren". Posted in
the same write as the result — by `addExpense` for a game-decided expense, by
`applyBracketUpdate` for every finished tournament or online duel, by the luck rounds' last
card. No chat push on top: the expense push already reaches everyone involved. The card links
to the game's page, or to `?tab=games`. `ChatEntryCard` reads the last five messages and never
counts your own as unread — a card your expense just posted mustn't light the dot for you.

### The Spiele tab's record

`games-tab.tsx` + `lib/games/game-stats.ts`. A period picker (Dieser Monat / Dieses Jahr /
Gesamt) for the whole tab; in the month view first place on the money podium is titled
"Pechvogel des Monats". New: the duel record (wins and losses over every decided match of every
finished tournament — online duels and brackets, the ones for fun included — plus head-to-head
pairs), the favourite games, and "Letzte Runden" mixing game expenses with free tournaments.
Finished tournaments come from `useFinishedTournaments` (a `finishedAt` range query, newest
first, so no composite index), subscribed only once the tab has been opened; an empty cache
offline says "Für die Duell-Bilanz brauchst du Internet" instead of "keine Duelle". A tournament
that booked an expense counts as that expense, never twice. One-phone ladder duels aren't
recorded match by match, so they count only in the rounds — the footnote says so.

### Revanche

`createRematch` (`tournaments.ts`) + `RematchButton` (`online/rematch-button.tsx`) under a
finished online game, for its players: the same game, people and stake; in a duel the loser
moves first (`rematchSeedOrder`), a bigger bracket is drawn afresh. Idempotent through
`Tournament.rematchId` — the second player's tap joins the first one's game. Only for games
played for fun or for a bare stake (`canRematch`, `lib/games/rematch.ts`): a game that booked a
real bill would book it twice. The others get the challenge push and a "X will Revanche" join
card. `createTournament` and `createRematch` share `newTournamentDoc` and `inviteMessage`.

### Anstupsen

`nudgeOpponent` + `NudgeButton` (`online/nudge-button.tsx`): once an online board has stood
still for `NUDGE_AFTER_MS` (2 min) the waiting player can send "{{name}} wartet auf dich",
then once per `NUDGE_COOLDOWN_MS` (10 min) per match — `waitingOn` (`lib/games/nudge.ts`)
knows whose move, missing hand or "ready" it is. The rate limit lives server-only in
`tournaments/{id}/nudges/{matchId}`. The nudge push has its own tag (with the time), so it
buzzes even over an earlier "Du bist dran" for the match. `pushReach` (`push/deliver.ts`) tells
the waiting player whether it reached anyone — "schaut gerade aufs Spiel", "hat keine
Benachrichtigungen an" (then a prefilled WhatsApp reminder is one tap away).

### Rubbellos online

ADR-005. The scratch dialog offers "Wo spielt ihr? Online" for a new bill (`DuelPlacePicker`
with its own hint). `createLuckRound` (`lib/actions/luck-rounds.ts`) writes
`groups/{id}/luckRounds/{roundId}`, sets `Group.activeLuckRound`, posts a `luckInvite` join
card and sends the challenge push (`luckChallengePushes`). Everyone scratches their own card
on `/groups/[groupId]/rounds/[roundId]` (`LuckRoundPageClient`), watching the others' foil drop
live; `ScratchCard` takes `isLoser: null` (a "?" under the foil, a spinner while the server
draws), `disabled` for someone else's card, and `payLabel` ("Zahlt!" on others' cards).

- **Drawn when scratched.** `revealScratchCard` draws the card's face in its transaction:
  "zahlt" with probability (payer cards left) / (cards left) (`drawScratchCard`,
  `lib/games/luck-round.ts`) — a shuffled deck's distribution, pinned by a Monte-Carlo test,
  with no dealt secret to read. Scratching an already scratched card just repeats its answer.
- **Who scratches what.** Your own card; a placeholder's is scratched by the round's creator
  (`canScratchFor`). "Restliche Lose aufdecken" (creator or manager) draws whatever is left, so
  nobody holds the bill up. Calling a round off is possible only before the first card.
- **The end.** The last card books the bill (`buildGameExpense` with the game record), clears
  `activeLuckRound`, posts the result card. `LuckRoundBanner` on the group page reads the
  pointer from the group document and only then the round ("Rubbel dein Los!").

## Round four: polish for the luck games, a luck index, a new game (2026-10)

Six improvements the owner approved together, one subsection each.

### The catch moment, for every payer, with the amount

Before, the "caught" moment depended on the game: the wheel, scratch cards, balloon and
pegboard gave every payer the shared `CatchFlash`; the dice cup and the duck race gave it only
to `losers[0]` (everybody else got a red pill in a list); and the lottery had its own 620 ms
full-board image of the laughing face that never said _who_ had been caught — the payer was a
16 px initial on the card. And no luck game but the slot knew what the bill was, so the slip
said "Erwischt!" but never "23,90 €", which is what the table actually reacts to.

**One hook for every catch.** `split-game/use-catch-flashes.ts` (`useCatchFlashes`) is the only
place that knows how a catch lands: it owns the slip state, the hold timers, and — on the
stamp's impact frame (`STAMP_IMPACT_S`) — the stamp sound, the laugh, the impact shake of the
play area and a buzz in the hand. It returns `[stageRef, catches]` (a tuple like
`useImpactShake`'s, so the React Compiler lint doesn't take reading `catches.flash` for reading
a ref):

- `catchOne(uid, { finale, delayMs })` — a catch the players just caused (a spin landing, a card
  scratched, a pop, a face tapped). Replaces any slip still up, holds `CATCH_FLASH_HOLD_MS`.
  With no delay it fires synchronously, inside the tap, which keeps iOS audio unlocked.
- `catchEach(uids, { delayMs })` — every payer of a round decided all at once, one slip after
  the other. Non-final slips hold `CATCH_FLASH_STEP_MS` (1.1 s), only the last gets the finale
  and the full hold, so three payers take about four seconds rather than five. The dice cup
  plays it lowest roll last ("Kleinster!" on that one, "Erwischt!" and "Gewürfelt: 42" on the
  others); the duck race in crossing order, so the last duck — the one everybody watched — is
  the finale ("Letzter!", the others "Platz 4 von 5").
- `active` (state) and `isActive()` (a ref, for a tap guard two fingers in one frame can't slip
  past) are true from the call until the last slip has cleared; every verdict and
  "Übernehmen" waits on it, which replaced the per-dialog `celebrated` flags. `cancel()` —
  "Neu mischen", closing, a new spin — drops the slip, every pending timer and a queued buzz;
  unmounting does the same.

The dialogs still render `CatchFlash` themselves, with their own stamp label and caption. The
later round-four features (dice zone, photo finish, wheel flick) stage their own build-up and
then hand the payers to `catchEach`/`catchOne`.

**The stake on the slip.** `AddExpenseDialog` passes `stake={{ description, amountMinor,
currency }}` to the seven one-phone luck dialogs, as it already did for the duels. The amount
is display only and never shown _during_ play — on each payer's slip (`CatchCaption`: "zahlt
23,90 € · Pizza" over the game's own line) and under each face in `GameResultBanner`, which
takes the `stake` and works the shares out from the very `loserUids` it shows. Hidden whenever
there is no amount yet (`hasStakeAmount`: the form can open a game before one is typed).

The cents must be the booked cents, rounding cent included. `handleSplitGameResolve` books
`splitEqual(amountMinor, loserUids)` in the order a game hands to `onResolve`, and
`lib/games/payers.ts` uses that same call in that same order (`stakeShares`), pinned by tests.
`splitEqual` with equal weights gives the leftover minor units to the first payers in list
order, so `payerShare(amountMinor, payerCount, index)` (`lib/money/split.ts`, tested against
`splitEqual` for every position) knows a payer's share before the rest are found — the balloon
uses it (`stakeShareAt`), since it books in pop order and the payer count is set. The wheel,
scratch cards and pegboard draw every payer at the start, the duck order is fixed before the
gun, the dice settle at the end — all of them show the final share on every slip. The lottery
is the exception: one person can catch two faces, so who pays is only certain once the last
laughing face is found, and only the last slip and the verdict carry an amount. The online
scratch round's banner gets `round.stake` too — same `splitEqual`, same order as
`buildGameExpense`.

**The lottery's catch.** Its own takeover is gone; a laughing face is now a `CatchFlash` over the
whole dialog naming whoever tapped it, with the face itself peeking over the slip's corner
(`CatchFlash`'s new `hero` slot, behind the slip, popping up on the impact frame). Its laugh
images are preloaded at the hero's size (`HERO_SIZES`), the same `/_next/image` URL, so the
face never arrives after the stamp. A repeat catch says "Schon wieder erwischt!". The slip is
`pointer-events-none` — the old overlay doubled as the board lock — so `tapCell` checks
`catches.isActive()` instead; "Neu mischen" now works mid-slip and cancels it. The lottery's
hand-copied setup and verdict block became `GamePoolSetupStep` and `GameResultBanner`. An
`aria-live` line announces who was caught ("Lea hat ein lachendes Gesicht erwischt."), which
nothing did before.

**Herzklopfen.** The lottery's twentieth tap used to feel like its first, although the odds had
long since changed. `lotteryHeartbeat(payLeft, facesLeft)` (`lib/games/lottery-heartbeat.ts`)
turns the odds of the next tap — laughing faces left over faces left, both public — into a
tempo between 60 and 160 bpm (on the square root of the odds, so a big board's early taps
already differ audibly) and an intensity. The dialog plays `playHeartbeatSound(intensity)` — a
"lub-dub" from 150 Hz down, because a phone speaker reproduces next to nothing below ~120 Hz —
from an effect-owned interval: it starts with the first tap (audio is unlocked by then),
restarts with every tap, rests while a slip is up, stops after eight beats if nobody taps, and
a new turn, "Neu mischen", closing or unmounting each end it without extra bookkeeping. On
screen: "Noch 2 von 5 Gesichtern lachen" under the found slots, with a heart beating at the same
tempo (it holds still under reduced motion). The tempo follows only how many faces are left,
never which, so it can't point at a face.

**Haptics.** `lib/games/haptics.ts`: `vibrate(pattern, delayMs)` and `cancelVibration()`, a
guarded `navigator.vibrate` that is a no-op where the API doesn't exist — iOS Safari, standalone
PWA included — so a buzz only ever doubles what the screen and the speaker already say. The
delay is written into the pattern (`[0, delay, …]`) rather than a timer, so the stamp's buzz
lands on its impact frame with nothing to clean up; `cancelVibration` stops a queued one. The
slot machine's private `vibrate()` moved onto it unchanged.

#### Everyone but one

The wheel, lottery and scratch cards used to allow `poolSize` payers. "Everyone pays" isn't a
game — the wheel's last spin had one wedge, the last scratch card nothing to hide — and the
four games of the second batch already capped at `poolSize - 1`. Now all of them do:
`maxPayerCount` (`lib/games/payers.ts`) through `useGamePoolSetup`, which the three games now
use instead of their own copies of that state, so a remembered count above the cap is clamped
like any other and a pool of two always means one payer. The online scratch setup shares the
stepper, and `createLuckRound` rejects `targetLoserCount === poolUids.length` as
`invalid-count` (`isValidLuckRoundCount` in `luck-round.ts`, unit-tested, plus a case in
`luck-rounds.emulator.test.ts`).

### Würfelbecher: live Zahlzone, "Schlag die 42!", Stechen

Before, the dice cup kept its list in seating order and `safe` only filled once a whole round
had been judged, so nobody got a ✓ mid-round and the stakes of a roll stayed invisible until
the round resolved. A tie on the line got the duels' small "Unentschieden — nochmal!" notice.

**Derived, never decided.** `diceStanding(game)` (`lib/games/dice-cup.ts`) reads a `DiceGame`
and returns the list `order`, a `seat` per player (`pays`, `zone`, `line`, `safe`, `waiting`),
`zoneSize` and the `target`. It judges the current round _as if it ended now_ — the real
`resolveDiceRound` on the rolls made so far — so it cannot disagree with the verdict, and it
changes no state, so it cannot move a payer. A property test over 400 random games pins it:
at every judged round the seats equal the verdict, nobody ever shown as safe ends up paying,
nobody shown as paying gets away, and the target means what the banner says (beat it and you
are safe, fall short and you are in).

One fact carries the whole feature: at the end of a round a player is safe exactly when at
least `slots` of the round's rolls are strictly lower than theirs, and later rolls only ever
add to that count. So being above the line is **final** the moment it happens — "certainly
safe" and "above the line right now" are the same set, there is no provisional "clear" state,
and the ✓ goes up at once. The mirror case, `pays` mid-round, needs every roll still to come
to land at or below them and still leave them in the zone (`atOrBelow + waiting ≤ slots`); it
only happens with two or more payers late in a round.

**The list.** `split-game/dice-standings.tsx`. Most at risk on top: settled payers, then the
round's zone and anyone level on its line (lowest roll first), then the red dashed
"↑ Zahlzone" line, then whoever is still to roll (in roll order, so the next roller sits right
under the line, ringed to match the turn banner), then the safe — this round's, then earlier
rounds' (later rounds first: they came closer to the line). Top rather than bottom, the
opposite of a league table's relegation zone, because on a phone the top of the list is what
shows under the felt without scrolling; hence the arrow. Rows move with `layout="position"`
on `springs.precise` (position only, so a row growing a "Pasch" line doesn't squash its text),
instantly under reduced motion. The fixed 5.5 rem / 4 rem columns are unchanged, so a row
still fits at 320 px; the new tags ("✓ sicher", "gleichauf") fit the 4 rem.

**The bill.** Every row in the zone or on its line holds a 🧾 on its avatar. It drops onto
whoever a roll pushes in and flies off whoever it pushes out, on the same frame, which reads as
one slip hopping across. It is not a shared `layoutId`: with the zone on top the bill's screen
position barely changes when it changes hands — the rows slide under it — and an enter/exit
pair also copes with a tie (more rows on the line than bills) without handing a bill to one of
them by seating.

**Per roll.** `diceZoneChanges(before, after)` names who `entered` the zone and who was
`saved`. Entering: the false-start buzzer at 55 % (`playBuzzerSound` now takes a volume — a
tease, not a penalty) and a 0.4 jolt through the catch hook's `shake`. Saved: a green
"Gerettet!" bubble that floats off the row and fades out by itself, so there is no timer to
clean up. Someone level on the line who has to roll off is neither — they go from the line to
waiting for the Stechen, still in it. The last roll's payoff is the catch and a tie's is the
takeover, so neither plays the buzzer. The live region follows the roll's own line with
"In der Zahlzone: Lea. Gerettet: Max."

**"Schlag die 42!"** The target is the `slots`-th lowest roll so far, compared by `diceRank`,
and `null` while fewer people have rolled than will pay ("Die Zahlzone ist noch offen — dein
Wurf landet erst mal drin."). The banner (`DiceTurnBanner`) words it the way the table reads
ranks, not numbers: "Schlag die 42 von Lea!", "Schlag den 3er-Pasch von Lea!" (33 outranks 65
although it is the smaller number), and over a Mäxchen "Ein Mäxchen ist nicht zu schlagen —
nur ein zweites hält mit." A tie names everyone on it ("von Lea und Max", `Intl.ListFormat`). A
chip beside it shows the roll as dice under "zu schlagen" — or "Mäxchen!", since nothing beats
one — and pops in afresh whenever the line moves.

**STECHEN!** When a judged round leaves people level on the line, `DiceStechenTakeover`
(`split-game/dice-stechen-takeover.tsx`) takes the play area: their faces creep in from both
sides under the drum roll and clash at `STECHEN_IMPACT_S` (0.9 s) — `playSwordSound` (now with a
delay; _stechen_ is also what a fencer does) and a 0.75 jolt land there — then a "Stechen!"
`InkStamp` in `--primary` ink hits the card 0.24 s later with the stamp's thump, so the two hits
read as two. All three sounds are scheduled on the audio clock when the takeover starts, like a
catch's stamp. The faces sit on a card of their own: over the scrim alone the names fought with
the rows behind. It holds `STECHEN_HOLD_MS` (2.4 s) on the dialog's `later` timers with
"Würfeln" disabled; "Neu mischen", closing and unmounting clear it with everything else. Under
reduced motion the faces are simply there and the stamp is printed. Afterwards a dashed
"STECHEN" strip with the existing "nur Lea, Max würfeln nochmal" stays until the roll-off ends.
`STAMP_DROP_S` is now exported from `celebration.tsx` so a caller can time an `InkStamp`'s
impact; `latestDiceRoll` moved from the dialog into `dice-cup.ts`.

## Related

[[Split Lottery]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Design System and Theming]]
· [[Local Development and Testing]] · [[Data Model]] · [[Firestore Rules]] · [[Routing Map]]
