/**
 * Pure Spielautomat rules. Everyone takes turns at one machine, in an order
 * shuffled once at the start, pulling `SLOT_SPINS_PER_TURN` times in a row
 * before passing it on. Every pull lands on a combination from the paytable
 * below, and the combination decides what happens to the bill: the spinner
 * pays their stake, gets it back, pays a multiple of it, wins free spins
 * (whose no-wins cost nothing and whose coins, worth more with every free
 * spin, the others pay), hands double the stake on to the next player,
 * points at someone to pay, duels someone, makes everyone else pay or
 * everyone at all, swaps tallies with someone, spins a bonus wheel, picks a
 * gift box, or hits the jackpot: everything they paid comes back, they are
 * out, and the others pay the progressive jackpot that every paid no-win
 * has been growing.
 *
 * Around the paytable: a 💎 wild doubles a three-of-a-kind; after a pair,
 * the spinner may hold it and respin the odd reel once per series; after a
 * paid loss the Risiko button offers double or nothing; a shield from the
 * wheel or a gift box strikes off the holder's next loss, and a boost
 * doubles their next three pulls; and four no-wins in a row guarantee the
 * next pull at least a pair.
 *
 * Everyone gets the same series and the same options, so in expectation
 * it's fair, but a single game can swing hard either way, which is the
 * point. Whatever happens, every charge is capped to what's still open, so
 * the tallies always add up to exactly `amountMinor` once the game is over.
 *
 * The outcome is drawn first and the reel faces are built to show it, the
 * same "decide first, animate after" pattern the other luck games use.
 * Randomness comes in through `SlotRandom` so the module stays deterministic
 * and unit-testable; the dialog passes crypto-backed helpers (`random.ts`).
 */

export type SlotSymbol =
  | "cherry"
  | "lemon"
  | "bell"
  | "star"
  | "clover"
  | "ghost"
  | "receipt"
  | "wheel"
  | "gift"
  | "swords"
  | "bomb"
  | "seven"
  | "wild";

/** The symbols a reel is made of. The wild only ever stands in for one of these inside a three-of-a-kind. */
export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  "cherry",
  "lemon",
  "bell",
  "star",
  "clover",
  "ghost",
  "receipt",
  "wheel",
  "gift",
  "swords",
  "bomb",
  "seven",
];

export const SLOT_SYMBOL_EMOJI: Record<SlotSymbol, string> = {
  cherry: "🍒",
  lemon: "🍋",
  bell: "🔔",
  star: "⭐",
  clover: "🍀",
  ghost: "👻",
  receipt: "🧾",
  wheel: "🎡",
  gift: "🎁",
  swords: "⚔️",
  bomb: "💣",
  seven: "7️⃣",
  wild: "💎",
};

export type SlotOutcomeKind =
  | "miss"
  | "pair"
  | "lemons"
  | "cherries"
  | "bells"
  | "stars"
  | "clover"
  | "receipt"
  | "wheel"
  | "gift"
  | "duel"
  | "ghost"
  | "bombs"
  | "jackpot";

export interface SlotPaytableEntry {
  kind: SlotOutcomeKind;
  /** Out of `SLOT_TOTAL_WEIGHT`, i.e. a percentage. */
  weight: number;
  /** The symbol that has to line up three times, for the three-of-a-kind rows. */
  symbol: SlotSymbol | null;
}

/** Ordered from the most to the least likely, which is also how the paytable is shown. */
export const SLOT_PAYTABLE: readonly SlotPaytableEntry[] = [
  { kind: "miss", weight: 40, symbol: null },
  { kind: "pair", weight: 22, symbol: null },
  { kind: "lemons", weight: 6, symbol: "lemon" },
  { kind: "cherries", weight: 5, symbol: "cherry" },
  { kind: "bells", weight: 4, symbol: "bell" },
  { kind: "stars", weight: 4, symbol: "star" },
  { kind: "clover", weight: 3, symbol: "clover" },
  { kind: "receipt", weight: 3, symbol: "receipt" },
  { kind: "wheel", weight: 3, symbol: "wheel" },
  { kind: "gift", weight: 3, symbol: "gift" },
  { kind: "duel", weight: 2, symbol: "swords" },
  { kind: "ghost", weight: 2, symbol: "ghost" },
  { kind: "bombs", weight: 2, symbol: "bomb" },
  { kind: "jackpot", weight: 1, symbol: "seven" },
];

export const SLOT_TOTAL_WEIGHT = SLOT_PAYTABLE.reduce((sum, entry) => sum + entry.weight, 0);

/** The combinations that are good news for the person who pulled them. The ghost depends on the swap. */
export const SLOT_GOOD_KINDS: ReadonlySet<SlotOutcomeKind> = new Set([
  "pair",
  "cherries",
  "bells",
  "stars",
  "clover",
  "wheel",
  "gift",
  "duel",
  "jackpot",
]);

/** How many stakes the spinner pays for the combinations that charge the spinner. */
const SPINNER_MULTIPLIER: Partial<Record<SlotOutcomeKind, number>> = {
  miss: 1,
  lemons: 3,
  bombs: 5,
};
/** Schwarzer Peter: the next player in line pays this many stakes. */
const BELLS_MULTIPLIER = 2;
/** Glücksklee: whoever the spinner points at pays this many stakes. */
const CLOVER_MULTIPLIER = 2;
/** Duell: whoever loses the duel pays this many stakes. */
const DUEL_MULTIPLIER = 3;

/** Everyone pulls this many times in a row before the machine passes on. */
export const SLOT_SPINS_PER_TURN = 3;
/** Three cherries award this many free spins, played straight away and on top of the series. */
export const SLOT_FREE_SPINS_AWARDED = 3;
/** Each free spin's coins are worth one more time than the last one's, up to this. */
export const SLOT_FREE_SPIN_MAX_MULTIPLIER = 5;

/**
 * The three-of-a-kinds a 💎 wild can show up in, doubling whatever the
 * combination does — the good ones and the bad ones alike. Not the ghost
 * (a swap can't be doubled), the wheel and the gift (their prizes are their
 * own thing) or the jackpot (it's already everything).
 */
export const SLOT_WILD_KINDS: ReadonlySet<SlotOutcomeKind> = new Set([
  "lemons",
  "cherries",
  "bells",
  "stars",
  "clover",
  "receipt",
  "duel",
  "bombs",
]);
/** Percent of those three-of-a-kinds that come with a wild. */
export const SLOT_WILD_CHANCE = 20;

/** Percent chance, per reel and free spin, that a coin lands above or below the payline. */
export const SLOT_COIN_CHANCE = 25;
/** What a coin is worth, in stakes, and how often each value turns up. */
export const SLOT_COIN_VALUES: readonly { multiplier: number; weight: number }[] = [
  { multiplier: 1, weight: 6 },
  { multiplier: 2, weight: 3 },
  { multiplier: 5, weight: 1 },
];

/** How many times in a row the Risiko button can double a loss. */
export const SLOT_GAMBLE_MAX_STEPS = 2;

/** Percent chance that the held pair's odd reel comes round to the matching symbol. */
export const SLOT_HOLD_CHANCE = 25;

/** The progressive jackpot grows by this share of the stake with every paid no-win. */
export const SLOT_JACKPOT_GROWTH = 0.5;

/** After this many no-wins in a row, the next pull is at least a pair. */
export const SLOT_PITY_AFTER = 4;

/** What the bonus wheel and the gift boxes can hold. */
export type SlotPrize = "othersPay2" | "pay3" | "shield" | "freeSpins" | "boost";

/** The bonus wheel's eight segments, clockwise from the top. */
export const SLOT_WHEEL_SEGMENTS: readonly SlotPrize[] = [
  "othersPay2",
  "pay3",
  "shield",
  "freeSpins",
  "othersPay2",
  "pay3",
  "shield",
  "boost",
];
/** Free spins the wheel's or a gift box's free-spins prize awards. */
export const SLOT_PRIZE_FREE_SPINS = 5;
/** How many of the holder's pulls a boost doubles. */
export const SLOT_BOOST_SPINS = 3;

/** The duel's pecking order, weakest first. */
export const SLOT_DUEL_RANK: readonly SlotSymbol[] = [
  "lemon",
  "bomb",
  "receipt",
  "ghost",
  "cherry",
  "clover",
  "bell",
  "star",
  "seven",
];

export interface SlotRandom {
  /** A uniform integer in `[min, max]`, both ends included. */
  int(min: number, max: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export type SlotFaces = readonly [SlotSymbol, SlotSymbol, SlotSymbol];

/** A coin on the reels during free spins, off the payline: `row` 0 is above it, 2 below. */
export interface SlotCoin {
  reel: number;
  row: 0 | 2;
  /** Its face value, in stakes, before the free-spin multiplier. */
  multiplier: number;
}

/** Everything random about one pull, drawn before the reels move. */
export interface SlotDraw {
  kind: SlotOutcomeKind;
  /** A 💎 stands in on one reel and doubles the combination. */
  wild: boolean;
  /** Coins that landed, on a free spin. */
  coins: SlotCoin[];
  /** For the ghost: whose tally the spinner swaps with. */
  swapTarget: string | null;
  /** For the wheel: which segment it stops on. */
  wheelIndex: number | null;
  /** For the gift: what's in each of the three boxes. */
  giftBoxes: SlotPrize[] | null;
}

export function drawSlotOutcome(random: SlotRandom): SlotOutcomeKind {
  let roll = random.int(1, SLOT_TOTAL_WEIGHT);
  for (const entry of SLOT_PAYTABLE) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return "miss";
}

/** The paytable without the no-win, for a pull the pity rule protects. */
function drawSlotOutcomeAtLeastPair(random: SlotRandom): SlotOutcomeKind {
  const total = SLOT_TOTAL_WEIGHT - (SLOT_PAYTABLE.find((e) => e.kind === "miss")?.weight ?? 0);
  let roll = random.int(1, total);
  for (const entry of SLOT_PAYTABLE) {
    if (entry.kind === "miss") continue;
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return "pair";
}

function drawCoinMultiplier(random: SlotRandom): number {
  const total = SLOT_COIN_VALUES.reduce((sum, value) => sum + value.weight, 0);
  let roll = random.int(1, total);
  for (const value of SLOT_COIN_VALUES) {
    roll -= value.weight;
    if (roll <= 0) return value.multiplier;
  }
  return 1;
}

/** Whatever else a combination needs drawn: the wild, the ghost's target, the wheel, the boxes. */
function drawExtras(
  state: SlotGameState,
  spinner: string,
  kind: SlotOutcomeKind,
  random: SlotRandom,
): Omit<SlotDraw, "kind" | "coins"> {
  const wild = SLOT_WILD_KINDS.has(kind) && random.int(1, 100) <= SLOT_WILD_CHANCE;
  let swapTarget: string | null = null;
  if (kind === "ghost") {
    const others = slotActiveSeats(state).filter((uid) => uid !== spinner);
    swapTarget = others[random.int(0, others.length - 1)] ?? null;
  }
  const wheelIndex = kind === "wheel" ? random.int(0, SLOT_WHEEL_SEGMENTS.length - 1) : null;
  const giftBoxes =
    kind === "gift"
      ? [0, 1, 2].map(() => SLOT_WHEEL_SEGMENTS[random.int(0, SLOT_WHEEL_SEGMENTS.length - 1)])
      : null;
  return { wild, swapTarget, wheelIndex, giftBoxes };
}

/** Draws one whole pull for the person at the machine. */
export function drawSlotSpin(state: SlotGameState, random: SlotRandom): SlotDraw {
  const spinner = slotSpinner(state);
  const pity = (state.streaks[spinner] ?? 0) <= -SLOT_PITY_AFTER;
  const kind = pity ? drawSlotOutcomeAtLeastPair(random) : drawSlotOutcome(random);
  const extras = drawExtras(state, spinner, kind, random);
  const coins: SlotCoin[] = [];
  if (state.freeSpinsLeft > 0) {
    for (let reel = 0; reel < 3; reel++) {
      if (random.int(1, 100) > SLOT_COIN_CHANCE) continue;
      const row: 0 | 2 = random.int(0, 1) === 0 ? 0 : 2;
      coins.push({ reel, row, multiplier: drawCoinMultiplier(random) });
    }
  }
  return { kind, coins, ...extras };
}

/** The symbol that has to line up three times for `kind`. */
export function slotTripleSymbol(kind: SlotOutcomeKind): SlotSymbol | null {
  return SLOT_PAYTABLE.find((entry) => entry.kind === kind)?.symbol ?? null;
}

/**
 * Reel faces that show `kind`. A pair puts its odd symbol on a random reel,
 * so a third of all pairs line up on the first two reels and get the slow,
 * drum-rolled third reel, which is where the near misses come from. A wild
 * takes the place of one symbol in a three-of-a-kind.
 */
export function slotReelFaces(kind: SlotOutcomeKind, random: SlotRandom, wild = false): SlotFaces {
  if (kind === "miss") {
    const [a, b, c] = random.shuffle(SLOT_SYMBOLS);
    return [a, b, c];
  }
  if (kind === "pair") {
    const [matched, odd] = random.shuffle(SLOT_SYMBOLS);
    const faces = [matched, matched, matched];
    faces[random.int(0, 2)] = odd;
    return [faces[0], faces[1], faces[2]];
  }
  const symbol = slotTripleSymbol(kind) ?? "seven";
  const faces: SlotSymbol[] = [symbol, symbol, symbol];
  if (wild) faces[random.int(0, 2)] = "wild";
  return [faces[0], faces[1], faces[2]];
}

/** Reads a combination back off the reels: the inverse of `slotReelFaces`. A wild matches anything. */
export function slotOutcomeForFaces(faces: SlotFaces): SlotOutcomeKind {
  const symbols = faces.filter((face) => face !== "wild");
  if (symbols.every((face) => face === symbols[0])) {
    return SLOT_PAYTABLE.find((entry) => entry.symbol === symbols[0])?.kind ?? "miss";
  }
  const [a, b, c] = faces;
  if (a === b || b === c || a === c) return "pair";
  return "miss";
}

/** For a pair: the matching symbol and the reel that doesn't match. */
export function slotPairParts(faces: SlotFaces): { symbol: SlotSymbol; oddReel: number } | null {
  const [a, b, c] = faces;
  if (a === b && b !== c) return { symbol: a, oddReel: 2 };
  if (a === c && a !== b) return { symbol: a, oddReel: 1 };
  if (b === c && a !== b) return { symbol: b, oddReel: 0 };
  return null;
}

/** What a prize is worth on average, in stakes, for a table of `playerCount`. */
function expectedPrizeStakes(playerCount: number): number {
  const others = Math.max(playerCount - 1, 1);
  const total = SLOT_WHEEL_SEGMENTS.reduce(
    (sum, prize) => sum + (prize === "othersPay2" ? 2 * others : prize === "pay3" ? 3 : 0),
    0,
  );
  return total / SLOT_WHEEL_SEGMENTS.length;
}

/**
 * The average share of the bill one pull allocates, in stakes, for a table
 * of `playerCount`, wilds included. The jackpot's refund and the ghost's
 * swap move nothing on average; shields, boosts, holds and the progressive
 * jackpot roughly even out and are left out too.
 */
export function expectedStakesPerSpin(playerCount: number): number {
  const others = Math.max(playerCount - 1, 1);
  const wildBoost = 1 + SLOT_WILD_CHANCE / 100;
  let total = 0;
  for (const entry of SLOT_PAYTABLE) {
    const p = entry.weight / SLOT_TOTAL_WEIGHT;
    const boost = SLOT_WILD_KINDS.has(entry.kind) ? wildBoost : 1;
    total += p * boost * (SPINNER_MULTIPLIER[entry.kind] ?? 0);
    if (entry.kind === "bells") total += p * boost * BELLS_MULTIPLIER;
    if (entry.kind === "stars") total += p * boost * others;
    if (entry.kind === "clover") total += p * boost * CLOVER_MULTIPLIER;
    if (entry.kind === "duel") total += p * boost * DUEL_MULTIPLIER;
    if (entry.kind === "receipt") total += p * boost * Math.max(playerCount, 2);
    if (entry.kind === "wheel" || entry.kind === "gift") {
      total += p * expectedPrizeStakes(playerCount);
    }
  }
  return total;
}

/**
 * The same average per *regular* pull of a series, counting the free spins
 * that pulls set off along the way: cherries award free spins (twice as many
 * with a wild), a free spin's no-win costs nothing, and its coins, worth more
 * with every free spin, fill a pot the others pay.
 */
export function expectedStakesPerTurnSpin(playerCount: number): number {
  const weightOf = (kind: SlotOutcomeKind) =>
    (SLOT_PAYTABLE.find((entry) => entry.kind === kind)?.weight ?? 0) / SLOT_TOTAL_WEIGHT;
  const wildShare = SLOT_WILD_CHANCE / 100;
  // Free spins per pull, as a share of all pulls. Bounded well below 1 by the paytable.
  const freeShare = weightOf("cherries") * SLOT_FREE_SPINS_AWARDED * (1 + wildShare);
  const coinWeight = SLOT_COIN_VALUES.reduce((sum, value) => sum + value.weight, 0);
  const coinValue =
    SLOT_COIN_VALUES.reduce((sum, value) => sum + value.multiplier * value.weight, 0) / coinWeight;
  // Three free spins at ×1, ×2, ×3 average out at ×2.
  const coinsPerFreeSpin = 3 * (SLOT_COIN_CHANCE / 100) * coinValue * 2;
  const perPull =
    expectedStakesPerSpin(playerCount) -
    freeShare * weightOf("miss") +
    freeShare * coinsPerFreeSpin;
  return perPull / (1 - freeShare);
}

export type SlotDuration = "short" | "normal" | "long";

/** Roughly how many times around the table a game lasts, per duration: each round is a full series per person. */
export const SLOT_DURATION_ROUNDS: Record<SlotDuration, number> = {
  short: 1,
  normal: 2,
  long: 3,
};

/** Round, coin-like stakes, per power of ten: 1, 1.50, 2, 2.50, 3, 4, 5, 6, 8. */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/** The "nice" amount closest to `raw`, measured as a ratio so 1 € and 100 € round alike. */
export function niceStakeMinor(raw: number): number {
  if (!(raw > 1)) return 1;
  let best = 1;
  let bestDistance = Infinity;
  for (let scale = 1; scale <= raw * 10; scale *= 10) {
    for (const step of NICE_STEPS) {
      const candidate = step * scale;
      if (!Number.isInteger(candidate)) continue;
      const distance = Math.abs(Math.log(candidate / raw));
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * A stake that makes a game of `amountMinor` across `playerCount` people last
 * about `SLOT_DURATION_ROUNDS[duration]` rounds, rounded to a coin-like
 * amount and never more than the bill itself.
 */
export function slotStakeForDuration(
  amountMinor: number,
  playerCount: number,
  duration: SlotDuration,
): number {
  if (amountMinor <= 0 || playerCount <= 0) return 0;
  const spins = playerCount * SLOT_DURATION_ROUNDS[duration] * SLOT_SPINS_PER_TURN;
  const raw = amountMinor / (spins * expectedStakesPerTurnSpin(playerCount));
  return Math.min(niceStakeMinor(raw), amountMinor);
}

/** A decision the person who pulled has to make before the game goes on. */
export type SlotPending =
  | { type: "clover"; uid: string; amountMinor: number }
  | { type: "duel"; uid: string; amountMinor: number }
  | { type: "gift"; uid: string; boxes: readonly SlotPrize[] };

export interface SlotGameState {
  amountMinor: number;
  stakeMinor: number;
  /** Everyone who started, in turn order. Jackpot winners stay listed but are skipped. */
  seats: readonly string[];
  /** Jackpot winners: out of the game, owing nothing. */
  out: readonly string[];
  /** Who is at the machine: an index into `seats`, always an active seat. */
  turn: number;
  /** What each person owes so far. Never negative; a zero entry is removed. */
  tallies: Readonly<Record<string, number>>;
  /** Regular pulls the person at the machine has left in their series. */
  turnSpinsLeft: number;
  /** Free spins the person at the machine has banked; they are played before the rest of the series. */
  freeSpinsLeft: number;
  /** What the next free spin's coins are multiplied by. Back to 1 outside free spins. */
  freeSpinMultiplier: number;
  /** Coins collected during the current free spins; the others pay it when they run out. */
  coinPotMinor: number;
  /** The progressive jackpot: grows with every paid no-win, paid by the others on 777. */
  jackpotPotMinor: number;
  /** A clover pick, a duel or a gift box is waiting on the person who pulled it. */
  pending: SlotPending | null;
  /** The Risiko button is on offer: `uid` may stake `amountMinor` on a coin flip. */
  gamble: { uid: string; amountMinor: number; step: number } | null;
  /** Halten: the person at the machine may hold the pair and respin `reel`. */
  hold: { uid: string; symbol: SlotSymbol; reel: number } | null;
  /** The person at the machine already used this series' hold. */
  holdUsed: boolean;
  /** People holding a shield: their next own loss is struck off. */
  shields: readonly string[];
  /** A boost: `uid`'s next `spinsLeft` pulls count double. */
  boost: { uid: string; spinsLeft: number } | null;
  /** Per person: wins in a row (positive) or no-wins in a row (negative). */
  streaks: Readonly<Record<string, number>>;
  spins: number;
}

export interface SlotCharge {
  uid: string;
  /** Positive: added to their tally. Negative: taken off it (a refund, a swap, a won gamble). */
  amountMinor: number;
}

/** A prize from the wheel or a gift box, and what it did. */
export interface SlotPrizeOutcome {
  prize: SlotPrize;
  uid: string;
  charges: SlotCharge[];
}

export interface SlotSpinResult {
  spinner: string;
  kind: SlotOutcomeKind;
  faces: SlotFaces;
  /** A wild doubled this combination. */
  wild: boolean;
  /** A boost doubled this pull. */
  boosted: boolean;
  /** A shield struck off the spinner's loss on this pull. */
  shieldUsed: boolean;
  /** The pity rule guaranteed this pull at least a pair. */
  pity: boolean;
  /** Every tally change this pull caused, in the order they happened, payouts included. */
  charges: SlotCharge[];
  /** After a jackpot left a single player at the machine: they took the rest of the bill. */
  lastPayer: string | null;
  /** This pull was one of the spinner's free spins: a no-win cost nothing. */
  freeSpin: boolean;
  /** Free spins this pull awarded (three cherries, or a prize). */
  freeSpinsAwarded: number;
  /** Coins that landed on this free spin, the multiplier they counted at, and what they added to the pot. */
  coins: SlotCoin[];
  coinMultiplier: number;
  coinsCollectedMinor: number;
  /** The free spins ended with this pull and the pot was paid by the others. */
  potPayout: { totalMinor: number; charges: SlotCharge[] } | null;
  /** The progressive jackpot went off: the others paid it. */
  jackpotPayout: { totalMinor: number; charges: SlotCharge[] } | null;
  /** The ghost: who the spinner swapped with, and both tallies before the swap. */
  swap: { uid: string; spinnerBefore: number; otherBefore: number } | null;
  /** The wheel: where it stopped, and the prize's effect. */
  wheel: { index: number; outcome: SlotPrizeOutcome } | null;
  /** A held pair's respin: which reel turned, and whether it completed the three-of-a-kind. */
  respin: { reel: number; completed: boolean } | null;
  state: SlotGameState;
}

export function startSlotGame(
  pool: readonly string[],
  amountMinor: number,
  stakeMinor: number,
  random: SlotRandom,
): SlotGameState {
  if (pool.length < 2) throw new Error("A slot machine game needs at least two players");
  if (amountMinor <= 0) throw new Error("Nothing to play for");
  if (stakeMinor <= 0) throw new Error("The stake must be positive");
  return {
    amountMinor,
    stakeMinor,
    seats: random.shuffle(pool),
    out: [],
    turn: 0,
    tallies: {},
    turnSpinsLeft: SLOT_SPINS_PER_TURN,
    freeSpinsLeft: 0,
    freeSpinMultiplier: 1,
    coinPotMinor: 0,
    jackpotPotMinor: 0,
    pending: null,
    gamble: null,
    hold: null,
    holdUsed: false,
    shields: [],
    boost: null,
    streaks: {},
    spins: 0,
  };
}

export function slotAllocated(state: SlotGameState): number {
  return Object.values(state.tallies).reduce((sum, amount) => sum + amount, 0);
}

export function slotRemaining(state: SlotGameState): number {
  return Math.max(state.amountMinor - slotAllocated(state), 0);
}

export function isSlotGameOver(state: SlotGameState): boolean {
  return slotRemaining(state) === 0;
}

export function slotActiveSeats(state: SlotGameState): string[] {
  return state.seats.filter((uid) => !state.out.includes(uid));
}

export function slotSpinner(state: SlotGameState): string {
  return state.seats[state.turn];
}

/** The next player still in the game after `uid`, going round the table. */
export function nextSlotPlayer(state: SlotGameState, uid: string): string {
  const start = state.seats.indexOf(uid);
  for (let step = 1; step <= state.seats.length; step++) {
    const candidate = state.seats[(start + step) % state.seats.length];
    if (!state.out.includes(candidate)) return candidate;
  }
  return uid;
}

/** Who the clover or the duel lets `uid` point at: everyone else still in the game. */
export function slotChoiceCandidates(state: SlotGameState, uid: string): string[] {
  return slotActiveSeats(state).filter((candidate) => candidate !== uid);
}

/** Everyone still in the game, starting with `uid` and going round the table. */
function rotateFrom(state: SlotGameState, uid: string): string[] {
  const order = [uid];
  let current = nextSlotPlayer(state, uid);
  while (current !== uid) {
    order.push(current);
    current = nextSlotPlayer(state, current);
  }
  return order;
}

/** Splits `total` as evenly as minor units allow, the first in line taking the odd cents. */
function splitEvenly(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total % count ? 1 : 0));
}

/**
 * A mutable copy of the state plus a capped ledger: every move that touches
 * the bill goes through `charge` and `refund`, so nothing can overshoot the
 * total or push a tally below zero.
 */
function workOn(state: SlotGameState) {
  const next: SlotGameState = { ...state, tallies: { ...state.tallies } };
  const tallies = next.tallies as Record<string, number>;
  const charges: SlotCharge[] = [];
  let remaining = slotRemaining(state);
  return {
    next,
    tallies,
    charges,
    remaining: () => remaining,
    /** Adds up to `wanted` to `uid`, never past the bill. Returns what was actually charged. */
    charge(uid: string, wanted: number): number {
      const amount = Math.min(wanted, remaining);
      if (amount <= 0) return 0;
      tallies[uid] = (tallies[uid] ?? 0) + amount;
      remaining -= amount;
      charges.push({ uid, amountMinor: amount });
      return amount;
    },
    /** Takes up to `wanted` off `uid`'s tally. */
    refund(uid: string, wanted: number): number {
      const amount = Math.min(wanted, tallies[uid] ?? 0);
      if (amount <= 0) return 0;
      tallies[uid] -= amount;
      if (tallies[uid] === 0) delete tallies[uid];
      remaining += amount;
      charges.push({ uid, amountMinor: -amount });
      return amount;
    },
    /** Charges each of `payers` an even share of `total`. */
    splitAmong(payers: string[], total: number): SlotCharge[] {
      const shares = splitEvenly(total, Math.max(payers.length, 1));
      const paid: SlotCharge[] = [];
      payers.forEach((uid, index) => {
        const amount = this.charge(uid, shares[index]);
        if (amount > 0) paid.push({ uid, amountMinor: amount });
      });
      return paid;
    },
  };
}

type Work = ReturnType<typeof workOn>;

/** Applies a wheel or gift-box prize to `uid`. */
function applyPrize(work: Work, uid: string, prize: SlotPrize): SlotPrizeOutcome {
  const stake = work.next.stakeMinor;
  const before = work.charges.length;
  switch (prize) {
    case "othersPay2":
      for (const other of rotateFrom(work.next, uid).slice(1)) work.charge(other, 2 * stake);
      break;
    case "pay3":
      work.charge(uid, 3 * stake);
      break;
    case "shield":
      if (!work.next.shields.includes(uid)) work.next.shields = [...work.next.shields, uid];
      break;
    case "freeSpins":
      work.next.freeSpinsLeft += SLOT_PRIZE_FREE_SPINS;
      break;
    case "boost":
      work.next.boost = { uid, spinsLeft: SLOT_BOOST_SPINS };
      break;
  }
  return { prize, uid, charges: work.charges.slice(before) };
}

/** Wins in a row go up, no-wins in a row go down; a costly combination resets to zero. */
function updateStreak(work: Work, uid: string, kind: SlotOutcomeKind, good: boolean) {
  const current = work.next.streaks[uid] ?? 0;
  const next = kind === "miss" ? Math.min(current, 0) - 1 : good ? Math.max(current, 0) + 1 : 0;
  work.next.streaks = { ...work.next.streaks, [uid]: next };
}

/**
 * Hands the machine on when `spinner`'s turn is done: they hit the jackpot,
 * or their series and free spins are used up. Waits while a decision is
 * pending, so a prize that awards free spins still goes to them.
 */
function settleTurn(work: Work, spinner: string) {
  const next = work.next;
  if (next.pending || work.remaining() <= 0 || slotSpinner(next) !== spinner) return;
  const turnOver =
    next.out.includes(spinner) || (next.turnSpinsLeft <= 0 && next.freeSpinsLeft <= 0);
  if (!turnOver) return;
  next.turn = next.seats.indexOf(nextSlotPlayer(next, spinner));
  next.turnSpinsLeft = SLOT_SPINS_PER_TURN;
  next.freeSpinsLeft = 0;
  next.freeSpinMultiplier = 1;
  next.coinPotMinor = 0;
  next.hold = null;
  next.holdUsed = false;
}

interface ResolveOptions {
  /** A regular pull uses up a spin and can earn coins and a hold; a held respin does neither. */
  pull: boolean;
  pity?: boolean;
  respin?: { reel: number; completed: boolean } | null;
}

/** The heart of the machine: what one combination does to the bill and the turn. */
function resolve(
  state: SlotGameState,
  draw: SlotDraw,
  faces: SlotFaces,
  options: ResolveOptions,
): SlotSpinResult {
  if (isSlotGameOver(state)) throw new Error("The bill is already fully allocated");
  if (state.pending) throw new Error("A decision is still pending");

  const spinner = slotSpinner(state);
  const work = workOn(state);
  const next = work.next;
  next.gamble = null;
  next.hold = null;
  const freeSpin = options.pull && state.freeSpinsLeft > 0;
  const kind = draw.kind;
  const wild = draw.wild && SLOT_WILD_KINDS.has(kind);
  const boosted = state.boost?.uid === spinner && state.boost.spinsLeft > 0;
  const stake = state.stakeMinor * (wild ? 2 : 1) * (boosted ? 2 : 1);
  const others = () => slotActiveSeats(next).filter((uid) => uid !== spinner);
  let lastPayer: string | null = null;
  let swap: SlotSpinResult["swap"] = null;
  let wheel: SlotSpinResult["wheel"] = null;
  let jackpotPayout: SlotSpinResult["jackpotPayout"] = null;
  let shieldUsed = false;
  let freeSpinsAwarded = 0;
  const freeSpinsBefore = next.freeSpinsLeft;

  if (options.pull) {
    if (freeSpin) next.freeSpinsLeft -= 1;
    else next.turnSpinsLeft -= 1;
    next.spins += 1;
  }
  if (boosted && state.boost) {
    next.boost =
      state.boost.spinsLeft > 1 ? { ...state.boost, spinsLeft: state.boost.spinsLeft - 1 } : null;
  }

  let spinnerCharged = 0;
  const multiplier = SPINNER_MULTIPLIER[kind];
  if (kind === "miss" && freeSpin) {
    // A free spin's stake is on the house.
  } else if (multiplier !== undefined) {
    if (next.shields.includes(spinner)) {
      next.shields = next.shields.filter((uid) => uid !== spinner);
      shieldUsed = true;
    } else {
      spinnerCharged = work.charge(spinner, stake * multiplier);
      if (kind === "miss" && spinnerCharged > 0) {
        next.jackpotPotMinor += Math.floor(state.stakeMinor * SLOT_JACKPOT_GROWTH);
      }
    }
  } else if (kind === "bells") {
    work.charge(nextSlotPlayer(state, spinner), stake * BELLS_MULTIPLIER);
  } else if (kind === "stars") {
    for (const uid of rotateFrom(state, spinner).slice(1)) work.charge(uid, stake);
  } else if (kind === "receipt") {
    for (const uid of rotateFrom(state, spinner)) work.charge(uid, stake);
  } else if (kind === "clover") {
    const candidates = others();
    if (candidates.length === 1) work.charge(candidates[0], stake * CLOVER_MULTIPLIER);
    else next.pending = { type: "clover", uid: spinner, amountMinor: stake * CLOVER_MULTIPLIER };
  } else if (kind === "duel") {
    next.pending = { type: "duel", uid: spinner, amountMinor: stake * DUEL_MULTIPLIER };
  } else if (kind === "gift") {
    next.pending = {
      type: "gift",
      uid: spinner,
      boxes: draw.giftBoxes ?? [
        SLOT_WHEEL_SEGMENTS[0],
        SLOT_WHEEL_SEGMENTS[1],
        SLOT_WHEEL_SEGMENTS[2],
      ],
    };
  } else if (kind === "wheel") {
    const index = draw.wheelIndex ?? 0;
    wheel = { index, outcome: applyPrize(work, spinner, SLOT_WHEEL_SEGMENTS[index]) };
  } else if (kind === "cherries") {
    freeSpinsAwarded = SLOT_FREE_SPINS_AWARDED * (wild ? 2 : 1);
    next.freeSpinsLeft += freeSpinsAwarded;
  } else if (kind === "ghost") {
    const target = draw.swapTarget ?? nextSlotPlayer(state, spinner);
    const spinnerBefore = work.tallies[spinner] ?? 0;
    const otherBefore = work.tallies[target] ?? 0;
    swap = { uid: target, spinnerBefore, otherBefore };
    for (const [uid, value] of [
      [spinner, otherBefore],
      [target, spinnerBefore],
    ] as const) {
      if (value > 0) work.tallies[uid] = value;
      else delete work.tallies[uid];
    }
    if (otherBefore !== spinnerBefore) {
      work.charges.push({ uid: spinner, amountMinor: otherBefore - spinnerBefore });
      work.charges.push({ uid: target, amountMinor: spinnerBefore - otherBefore });
    }
  } else if (kind === "jackpot") {
    work.refund(spinner, work.tallies[spinner] ?? 0);
    next.out = [...next.out, spinner];
    next.shields = next.shields.filter((uid) => uid !== spinner);
    if (next.boost?.uid === spinner) next.boost = null;
    const stillIn = slotActiveSeats(next);
    if (stillIn.length === 1) {
      lastPayer = stillIn[0];
      work.charge(lastPayer, work.remaining());
    } else if (next.jackpotPotMinor > 0) {
      const total = next.jackpotPotMinor;
      jackpotPayout = {
        totalMinor: total,
        charges: work.splitAmong(rotateFrom(next, nextSlotPlayer(next, spinner)), total),
      };
    }
    next.jackpotPotMinor = 0;
  }
  if (wheel?.outcome.prize === "freeSpins") freeSpinsAwarded += SLOT_PRIZE_FREE_SPINS;

  // Coins only pay on a free spin, at that free spin's multiplier, into the pot.
  const coins = freeSpin ? draw.coins : [];
  const coinMultiplier = freeSpin ? state.freeSpinMultiplier : 1;
  const coinsCollectedMinor = coins.reduce(
    (sum, coin) => sum + coin.multiplier * coinMultiplier * state.stakeMinor,
    0,
  );
  next.coinPotMinor += coinsCollectedMinor;
  if (freeSpin) {
    next.freeSpinMultiplier = Math.min(state.freeSpinMultiplier + 1, SLOT_FREE_SPIN_MAX_MULTIPLIER);
  } else if (freeSpinsBefore === 0 && next.freeSpinsLeft > 0) {
    next.freeSpinMultiplier = 1;
  }

  // The free spins are over: everyone else pays the pot, split evenly.
  let potPayout: SlotSpinResult["potPayout"] = null;
  const freeSpinsOver = next.freeSpinsLeft <= 0 || next.out.includes(spinner);
  if (freeSpin && freeSpinsOver && next.coinPotMinor > 0) {
    const total = next.coinPotMinor;
    potPayout = { totalMinor: total, charges: work.splitAmong(others(), total) };
    next.coinPotMinor = 0;
  }
  if (freeSpin && freeSpinsOver) next.freeSpinMultiplier = 1;

  const good =
    kind === "ghost"
      ? swap !== null && swap.otherBefore < swap.spinnerBefore
      : SLOT_GOOD_KINDS.has(kind);
  updateStreak(work, spinner, kind, good);

  const remaining = work.remaining();
  if (spinnerCharged > 0 && !freeSpin && remaining > 0) {
    next.gamble = { uid: spinner, amountMinor: spinnerCharged, step: 0 };
  }

  settleTurn(work, spinner);

  // Halten: a pair on a regular pull, with the series still going, can be held once.
  const pairParts = kind === "pair" ? slotPairParts(faces) : null;
  if (
    options.pull &&
    pairParts &&
    !freeSpin &&
    !state.holdUsed &&
    remaining > 0 &&
    slotSpinner(next) === spinner &&
    next.turnSpinsLeft > 0
  ) {
    next.hold = { uid: spinner, symbol: pairParts.symbol, reel: pairParts.oddReel };
  }

  return {
    spinner,
    kind,
    faces,
    wild,
    boosted,
    shieldUsed,
    pity: options.pity ?? false,
    charges: work.charges,
    lastPayer,
    freeSpin,
    freeSpinsAwarded,
    coins,
    coinMultiplier,
    coinsCollectedMinor,
    potPayout,
    jackpotPayout,
    swap,
    wheel,
    respin: options.respin ?? null,
    state: next,
  };
}

/** Applies one pull with a known draw. `spinSlot` draws it; tests call this directly. */
export function applySlotDraw(
  state: SlotGameState,
  draw: SlotDraw,
  faces: SlotFaces,
  pity = false,
): SlotSpinResult {
  return resolve(state, draw, faces, { pull: true, pity });
}

/** A pull with a known outcome and nothing else random about it. Mostly for tests. */
export function applySlotOutcome(
  state: SlotGameState,
  kind: SlotOutcomeKind,
  faces: SlotFaces,
  extras: Partial<Omit<SlotDraw, "kind">> = {},
): SlotSpinResult {
  return applySlotDraw(
    state,
    {
      kind,
      wild: false,
      coins: [],
      swapTarget: null,
      wheelIndex: kind === "wheel" ? 0 : null,
      giftBoxes: null,
      ...extras,
    },
    faces,
  );
}

/** One pull of the lever: draws everything random about it and applies it. */
export function spinSlot(state: SlotGameState, random: SlotRandom): SlotSpinResult {
  const pity = (state.streaks[slotSpinner(state)] ?? 0) <= -SLOT_PITY_AFTER;
  const draw = drawSlotSpin(state, random);
  return applySlotDraw(state, draw, slotReelFaces(draw.kind, random, draw.wild), pity);
}

/**
 * Halten: hold the pair and respin the odd reel. With `SLOT_HOLD_CHANCE` it
 * comes round to the matching symbol and the three-of-a-kind plays out, good
 * or bad; otherwise it lands on something else and nothing more happens. The
 * respin doesn't use up a pull of the series.
 */
export function applySlotHold(
  state: SlotGameState,
  completed: boolean,
  random: SlotRandom,
): SlotSpinResult {
  const hold = state.hold;
  if (!hold) throw new Error("There is nothing to hold");
  const faces: SlotSymbol[] = [hold.symbol, hold.symbol, hold.symbol];
  const base: SlotGameState = { ...state, hold: null, holdUsed: true };
  if (!completed) {
    const others = SLOT_SYMBOLS.filter((symbol) => symbol !== hold.symbol);
    faces[hold.reel] = others[random.int(0, others.length - 1)];
    return {
      spinner: hold.uid,
      kind: "pair",
      faces: [faces[0], faces[1], faces[2]],
      wild: false,
      boosted: false,
      shieldUsed: false,
      pity: false,
      charges: [],
      lastPayer: null,
      freeSpin: false,
      freeSpinsAwarded: 0,
      coins: [],
      coinMultiplier: 1,
      coinsCollectedMinor: 0,
      potPayout: null,
      jackpotPayout: null,
      swap: null,
      wheel: null,
      respin: { reel: hold.reel, completed: false },
      state: { ...base, gamble: null },
    };
  }
  const kind = SLOT_PAYTABLE.find((entry) => entry.symbol === hold.symbol)?.kind ?? "pair";
  const extras = drawExtras(base, hold.uid, kind, random);
  if (extras.wild) faces[hold.reel] = "wild";
  return resolve(base, { kind, coins: [], ...extras }, [faces[0], faces[1], faces[2]], {
    pull: false,
    respin: { reel: hold.reel, completed: true },
  });
}

/** Draws whether a held pair's respin completes it. */
export function drawSlotHold(random: SlotRandom): boolean {
  return random.int(1, 100) <= SLOT_HOLD_CHANCE;
}

/** The duel: each side spins one reel; the weaker symbol pays. */
export interface SlotDuelOutcome {
  challenger: string;
  opponent: string;
  challengerSymbol: SlotSymbol;
  opponentSymbol: SlotSymbol;
  loser: string;
}

/** Draws the duel's two reels: two different ranks, so there's always a loser. */
export function drawSlotDuel(random: SlotRandom): [SlotSymbol, SlotSymbol] {
  const first = random.int(0, SLOT_DUEL_RANK.length - 1);
  let second = random.int(0, SLOT_DUEL_RANK.length - 2);
  if (second >= first) second += 1;
  return [SLOT_DUEL_RANK[first], SLOT_DUEL_RANK[second]];
}

/**
 * The clover or the duel: the person who pulled it points at `target`. For
 * the clover, `target` pays. For the duel, `duelSymbols` (challenger's,
 * target's) decide, and the weaker one pays.
 */
export function applySlotChoice(
  state: SlotGameState,
  target: string,
  duelSymbols?: [SlotSymbol, SlotSymbol],
): { state: SlotGameState; charge: SlotCharge | null; duel: SlotDuelOutcome | null } {
  const pending = state.pending;
  if (!pending || pending.type === "gift") throw new Error("Nobody has a choice to make");
  if (!slotChoiceCandidates(state, pending.uid).includes(target)) {
    throw new Error("That person can't be picked");
  }
  const work = workOn(state);
  work.next.pending = null;
  let payer = target;
  let duel: SlotDuelOutcome | null = null;
  if (pending.type === "duel") {
    if (!duelSymbols) throw new Error("A duel needs its two reels");
    const [mine, theirs] = duelSymbols;
    const loser =
      SLOT_DUEL_RANK.indexOf(mine) < SLOT_DUEL_RANK.indexOf(theirs) ? pending.uid : target;
    duel = {
      challenger: pending.uid,
      opponent: target,
      challengerSymbol: mine,
      opponentSymbol: theirs,
      loser,
    };
    payer = loser;
  }
  const amount = work.charge(payer, pending.amountMinor);
  settleTurn(work, pending.uid);
  return {
    state: work.next,
    charge: amount > 0 ? { uid: payer, amountMinor: amount } : null,
    duel,
  };
}

/** The gift: the person who pulled it opens box `index`. */
export function applySlotGiftPick(
  state: SlotGameState,
  index: number,
): { state: SlotGameState; outcome: SlotPrizeOutcome } {
  const pending = state.pending;
  if (!pending || pending.type !== "gift") throw new Error("There is no gift to open");
  const prize = pending.boxes[index];
  if (!prize) throw new Error("There is no such box");
  const work = workOn(state);
  work.next.pending = null;
  const outcome = applyPrize(work, pending.uid, prize);
  settleTurn(work, pending.uid);
  return { state: work.next, outcome };
}

/**
 * The Risiko button: double or nothing on the loss just taken. `won` is the
 * coin flip; the dialog draws it with crypto randomness. Win, and the loss is
 * struck off; lose, and it doubles, and can be risked again up to
 * `SLOT_GAMBLE_MAX_STEPS` times. Fair in expectation either way.
 */
export function applySlotGamble(
  state: SlotGameState,
  won: boolean,
): { state: SlotGameState; charge: SlotCharge | null } {
  const gamble = state.gamble;
  if (!gamble) throw new Error("There is nothing to gamble");
  const work = workOn(state);
  if (won) {
    const amount = work.refund(gamble.uid, gamble.amountMinor);
    work.next.gamble = null;
    return {
      state: work.next,
      charge: amount > 0 ? { uid: gamble.uid, amountMinor: -amount } : null,
    };
  }
  const extra = work.charge(gamble.uid, gamble.amountMinor);
  const step = gamble.step + 1;
  const again = step < SLOT_GAMBLE_MAX_STEPS && work.remaining() > 0;
  work.next.gamble = again
    ? { uid: gamble.uid, amountMinor: gamble.amountMinor + extra, step }
    : null;
  return {
    state: work.next,
    charge: extra > 0 ? { uid: gamble.uid, amountMinor: extra } : null,
  };
}

/** Draws the Risiko coin flip. */
export function drawSlotGamble(random: SlotRandom): boolean {
  return random.int(0, 1) === 1;
}
