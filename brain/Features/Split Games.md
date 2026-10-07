---
tags: [feature, split-games, fun]
---

# Split Games (🎲🎡🎰🎫🎈🦆🥃🎱 · ⭕🔴🧠⚡✊🥢✏️ · ☝️)

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
the online scratch cards in [[#Round three: fairness, record, rematch, online luck (2026-10)]].

## What it is

A family of gamified alternatives to manually choosing a split, all reachable from the same
"🎮 Spiel" button in `add-expense-dialog.tsx`: tapping it opens `SplitGamePickerDialog`, a
two-category tile picker (see [[#The picker: two categories and a preview step]]), which hands
off to one of sixteen game dialogs. Every game is, like [[Split Lottery]] before it, purely a
**front-end input mechanism** that flows through the same `resolveExpense` / `buildSplits`
pipeline as a manually-entered split (see [[Expenses and Splitting]]) — none of them bypass or
duplicate the money-invariant logic. All of them but the slot machine resolve to a plain list
of "loser" uids that `add-expense-dialog.tsx` turns into an equal exact split via `splitEqual`.
The slot machine is the exception — see below.

The games split into two categories, each with its own resolution engine:

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
| ☝️ Finger drauf!           | `split-finger-dialog.tsx`       | Everyone rests a finger at once and lifts on a random-delay „LOS!“ — too early or slowest pays  |

Since round four the Minispiele also hold ☝️ Finger drauf!, the first skill game that is not a
duel: the whole table plays it at once on one phone, so it has no ladder, tournament or online
mode — see [[#Finger drauf! (☝️)]].

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

The picker and all sixteen game dialogs are lazy chunks (`split-game/lazy-dialogs.tsx`,
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
   catalog), and — for every duel (`isDuelGameId`) — a callout explaining the knockout-ladder behavior for
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

`src/lib/games/member-colors.ts` gives the wheel's wedges solid
colors keyed off the same name hash `avatarGradient` uses (`nameHash` in `lib/utils.ts`), so a
member's wheel wedge color and their avatar chip always agree. `duelPalettes(nameA, nameB)`
extends this for the duel games: each player's own `memberColor`, except when both names
hash to the same slot (a duel where both marks look identical is unreadable), in which case the
second player is bumped to the opposite side of the palette wheel.

## The `viaLottery` flag, now shared

All sixteen games set `Expense.viaLottery = true` when their result is applied (and since
2026-10 `Expense.game` — which game, who played, which attempt; see
[[#Round three: fairness, record, rematch, online luck (2026-10)]]) — the field name is
a holdover from when the lottery was the only game (see [[Data Model]]), but its actual meaning
has always been closer to "resolved via a split mini-game", so the existing
`computeLotteryTotals` leaderboard (now the group page's Spiele tab, `games-tab.tsx` — see
[[Group Page]]) already aggregates across all sixteen games
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
one person dry: at most `poolSize - 1` payers.

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
  `randomInt(1, 6)` drawn the instant the cup is shaken.
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

## Round four: catch moments, drama, a luck index, a new game (2026-10)

Six improvements, all approved by the owner. Each one's subsection says what changed and why.

### Glücks-Index

`luckIndex` (`lib/games/game-stats.ts`) and `LuckIndexSection` (`luck-index-section.tsx`), in
the Spiele tab under the podium and following its period picker. The podium ranks who lost the
most money, which mostly means who played the most. The index answers the question the table
actually argues about ("Ich hab IMMER Pech!"): did chance cost you more than it should have?

- **Expected vs. paid.** In a round of _n_ players every one of them pays `amountMinor / n` in
  expectation. That holds whether one person pays it all or three split it, and the slot
  machine's uneven charges are fair in expectation too (its Monte-Carlo test). What someone
  actually paid is their split. The index is the sum of `paid − expected` over the period's
  rounds, **in euros**, which was the owner's call: "18,40 € mehr gezahlt als erwartet". A
  count ("4× gezahlt, erwartet 2×") was the alternative. Euros are what people feel; the price
  is that one expensive bill weighs more than a cheap one.
- **What counts.** Only luck games (`isLuckGameId`), balloon and slot included: the balloon's
  burst point is a fair draw even if pumping is a choice. Duels are won, not drawn. Only
  expenses that carry a `game` record count. That means rounds from 2026-10 on, and not a
  round whose split was later edited by hand (`game: null`). The footnote says so, so an empty
  list isn't read as "nobody played". A round also has to hold together, meaning its players
  paid exactly the bill between them. This leaves out the one case where they don't: claiming
  a placeholder moves its split to the new uid (`moveMemberInLedgerEntry`) but not
  `game.playerUids`.
- **From three rounds.** A person is listed from `LUCK_INDEX_MIN_ROUNDS` (3) luck rounds in the
  period. Below that, the number is noise. Former members still count in the others' rounds but
  aren't listed, as on the podium.
- **Integer-safe.** A fair share is a fraction of a cent, so the bills are summed per pool size
  in minor units and divided once at the end. The expectation is then rounded for display, and
  the difference is taken from that rounded value, so paid = expected + difference holds
  exactly. Rounding each share first (3,33 € of a 10-€ bill) would have shown everyone in a
  perfectly even three-way game as a cent unlucky.
- **On screen.** Diverging bars around zero, like the Salden tab's "Wer steht wo": "◀ Glück"
  on the left in green, "Pech ▶" on the right in red, scaled to the biggest gap, most Pech
  first. The signed amount (`formatSignedMoney`, now shared with the balances tab) and the words
  "mehr/weniger gezahlt als erwartet · 9 Runden" carry the meaning, never the color alone. The
  section is hidden in a group that has never played a luck game with a record, where it could
  only ever be empty.
- **Wording.** Never as if the draw were rigged: "Gezogen wird fair – der Unterschied ist Glück
  oder Pech." Pech and Glück are relative to the expectation, not an accusation.
- **No new listener.** It renders from the same expenses as the podium, so offline use and
  snapshot-error handling are the tab's own.

### Finger drauf! (☝️)

`finger-race.ts` (rules), `split-finger-dialog.tsx` (dialog), tile `public/game-tiles/finger.jpg`.
The phone lies flat on the table and everyone rests one finger on their own circle. Once every
finger has rested for `FINGER_REST_MS` (600 ms) the round arms, and after a crypto-random pause
of 1.5–5 s (`randomInt`, the Reaktionsduell's range) the whole screen turns green with „LOS!“
and the go chime. Lifting before that is a false start and pays; otherwise the slowest _k_
pay. It is the only game in which everyone plays at the same moment: up to five people at once,
nobody waiting for the phone to come round, which is what the owner wanted from it.

- **A third id group.** It is neither a duel (no knockout ladder, no tournament, no online
  match) nor luck, so it is neither `DuelGameId` nor `LuckGameId` but `TableGameId` (`types.ts`,
  `TABLE_GAME_IDS` in `split-game-ids.ts`), part of `SplitGameId`. That one union is what
  `isSplitGameId`, `SPLIT_GAME_META`, `normalizeExpenseGame`, the chat result card and the
  Spiele tab key on, so all of them accept it without further changes, and `isLuckGameId`
  leaves it out of the Glücks-Index by construction. It sits in the "Minispiele" section, whose
  blurb now reads "im Duell oder alle auf einmal"; the preview shows the ladder callout only
  for `isDuelGameId`, no longer for every skill game. Its setup and `onResolve(losers, players)`
  are the luck games' (`useGamePoolSetup`, at most `pool − 1` payers).
- **Who pays** (`judgeFingerRound`). False starters pay. If there are more of them than
  payers, only they play again and everyone else is safe. The rest of the places go to the
  slowest; a finger that never came off is slower than any that did. Lifts within
  `FINGER_TIE_WINDOW_MS` (16 ms, the duel's) can't be ordered honestly by touch hardware, so a
  player is settled only where the order _around_ them is certain, and whoever is left on the
  paying line plays again — only they, like the dice cup's „Stechen“ (`FingerGame` carries the
  remaining contenders and paying places from round to round). A property test pins that every
  round fills exactly its paying places and that every safe player lifted certainly before
  every slow payer.
- **Closing early** (`fingerRoundSettled`). A round closes as soon as nothing left to happen
  can change it: the false starts decide it (60 ms after the deciding one, so a simultaneous
  second one still counts and „LOS!“ never comes), or every lift is older than the tie window
  and every finger still down pays anyway — lifting later only makes it slower. The table
  sees the verdict while the slowest finger is still on the glass (its circle says "noch
  drauf"), nobody waits out a dawdler, and the person about to pay can't wipe the result: a
  property test checks an early verdict against the one the remaining lifts would have given.
  Nobody lifting at all closes after `FINGER_LIFT_TIMEOUT_MS` (3 s).
- **`pointercancel` voids, never counts.** The system cancels touches on its own — an iPhone
  tracks five and cancels all of them on a sixth, palms, system gestures, a call. Until the
  round has closed a cancel voids it: false starts made before it stand, everyone else plays
  again ("Das Handy hat einen Finger verloren …"). While the fingers are still gathering it just
  frees the circle. Lifting while gathering is free too.
- **Touch bookkeeping.** A finger belongs, by `pointerId`, to the circle it came down on
  (`fingerDown`); a second finger on a held circle, a finger outside the circles and any finger
  once the round is armed are ignored, and so are their lifts. The circles listen for
  `pointerdown` (plus `setPointerCapture`); lifts and cancels are heard on `window` in the
  capture phase, so a finger that slides off its circle is still that finger and nothing can
  swallow its `pointerup`. Every handler goes through ref-mirrored state, like the reaction
  duel's pads: several fingers land in one frame. Times are `event.timeStamp`, on the same clock
  as the signal (`performance.now()`). The dialog only forwards events and timestamps; every
  decision is in the pure module.
- **The field.** A definite height (`clamp(20rem, --game-board-h, 34rem)`, never padding),
  `touch-none`, `select-none`, `-webkit-user-select: none`, `-webkit-touch-callout: none` and
  no context menu, so a resting finger starts no scroll, zoom, selection or long-press menu. The
  circles (`w-[min(6.5rem,30%)]`, at least 86 px on the narrowest phone) sit round an ellipse
  (`fingerSeats`, the first at the bottom edge, clockwise; tested to keep 104 px circles apart
  on a 343 × 320 field), each face and name turned to read from the edge it is nearest to — the
  table sits all round the phone. Circles show their owner's colours, fill when held, turn red
  on a false start and show each time after „LOS!“. Fingers cover the field, so the signal is
  the whole screen plus sound; on a muted phone it is the colour alone.
- **No button during play.** The footer shows the payer pips instead: a stray finger resting on
  a button would press it the moment it lifts on „LOS!“. ✕ still leaves; "Neu starten" and
  "Übernehmen" come with the verdict.
- **The end.** One slip per payer in the order they pay (1.1 s each, the full hold and the
  finale on the game's last one: "Zu langsam!" / "Fehlstart!", "Nach 312 ms losgelassen"), then
  `GameResultBanner` and "Wer war wie schnell?" (`fingerStandings`: safe players in round
  order, then the payers in reverse, slow ones by time, false starters last).
- **How many.** `fingerPoolLimit`: `min(5, navigator.maxTouchPoints || 5)`. A device that
  reports no touchscreen still gets five (and a hint that the game wants a phone); bigger
  groups get "höchstens 5 Finger … nimm das Glücksrad", like the pegboard's limit.
- **Only a real device can tell** whether iOS's three-finger edit gestures, Android OEM
  three-finger screenshot swipes and palm rejection leave the game alone. Chromium's touch
  emulation (several touch points at once through CDP) drove whole rounds, a false start, a
  cancel and a dead heat end to end; `split-finger-dialog.test.tsx` covers the same with
  jsdom pointer events.
- **The tile** was drawn as an SVG in the house style (cream ground, thick brown outlines, three
  hands on a phone on a table, „LOS!“ in the middle, the bottom-right quarter left to the badge)
  and rasterised with Chromium to a 390 px JPEG.

## Related

[[Split Lottery]] · [[Expenses and Splitting]] · [[Money Invariants]] · [[Design System and Theming]]
· [[Local Development and Testing]] · [[Data Model]] · [[Firestore Rules]] · [[Routing Map]]
