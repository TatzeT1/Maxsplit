/**
 * Pure Spielautomat rules. Everyone takes turns at one machine, in an order
 * shuffled once at the start, pulling `SLOT_SPINS_PER_TURN` times in a row
 * before passing it on. Every pull lands on a combination from the paytable
 * below, and the combination decides what happens to the bill: the spinner
 * pays their stake, gets it back, pays a multiple of it, wins free spins
 * (whose no-wins cost nothing and whose coins the others pay), hands double
 * the stake on to the next player, points at someone to pay, makes everyone
 * else pay or everyone at all, swaps tallies with someone, or hits the
 * jackpot and walks away with everything they paid so far refunded. A 💎
 * wild doubles a three-of-a-kind, and after a loss the Risiko button offers
 * double or nothing.
 *
 * Everyone gets the same series, so in expectation it's fair, but a single
 * game can swing hard either way, which is the point. Whatever happens, every
 * charge is capped to what's still open, so the tallies always add up to
 * exactly `amountMinor` once the game is over.
 *
 * The outcome is drawn first and the reel faces are built to show it, the
 * same "decide first, animate after" pattern the other luck games use.
 * Randomness comes in through `SlotRandom` so the module stays deterministic
 * and unit-testable; the dialog passes crypto-backed helpers (`random.ts`).
 */

export type SlotSymbol =
  "cherry" | "lemon" | "bell" | "star" | "clover" | "ghost" | "receipt" | "bomb" | "seven" | "wild";

/** The symbols a reel is made of. The wild only ever stands in for one of these inside a three-of-a-kind. */
export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  "cherry",
  "lemon",
  "bell",
  "star",
  "clover",
  "ghost",
  "receipt",
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
  { kind: "miss", weight: 46, symbol: null },
  { kind: "pair", weight: 24, symbol: null },
  { kind: "lemons", weight: 6, symbol: "lemon" },
  { kind: "cherries", weight: 5, symbol: "cherry" },
  { kind: "bells", weight: 4, symbol: "bell" },
  { kind: "stars", weight: 4, symbol: "star" },
  { kind: "clover", weight: 3, symbol: "clover" },
  { kind: "receipt", weight: 3, symbol: "receipt" },
  { kind: "ghost", weight: 2, symbol: "ghost" },
  { kind: "bombs", weight: 2, symbol: "bomb" },
  { kind: "jackpot", weight: 1, symbol: "seven" },
];

export const SLOT_TOTAL_WEIGHT = SLOT_PAYTABLE.reduce((sum, entry) => sum + entry.weight, 0);

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

/** Everyone pulls this many times in a row before the machine passes on. */
export const SLOT_SPINS_PER_TURN = 3;
/** Three cherries award this many free spins, played straight away and on top of the series. */
export const SLOT_FREE_SPINS_AWARDED = 3;

/**
 * The three-of-a-kinds a 💎 wild can show up in, doubling whatever the
 * combination does — the good ones and the bad ones alike. Not the ghost
 * (a swap can't be doubled) and not the jackpot (it's already everything).
 */
export const SLOT_WILD_KINDS: ReadonlySet<SlotOutcomeKind> = new Set([
  "lemons",
  "cherries",
  "bells",
  "stars",
  "clover",
  "receipt",
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
  /** Its value, in stakes. */
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
}

export function drawSlotOutcome(random: SlotRandom): SlotOutcomeKind {
  let roll = random.int(1, SLOT_TOTAL_WEIGHT);
  for (const entry of SLOT_PAYTABLE) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return "miss";
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

/** Draws one whole pull for the person at the machine. */
export function drawSlotSpin(state: SlotGameState, random: SlotRandom): SlotDraw {
  const kind = drawSlotOutcome(random);
  const wild = SLOT_WILD_KINDS.has(kind) && random.int(1, 100) <= SLOT_WILD_CHANCE;
  const coins: SlotCoin[] = [];
  if (state.freeSpinsLeft > 0) {
    for (let reel = 0; reel < 3; reel++) {
      if (random.int(1, 100) > SLOT_COIN_CHANCE) continue;
      const row: 0 | 2 = random.int(0, 1) === 0 ? 0 : 2;
      coins.push({ reel, row, multiplier: drawCoinMultiplier(random) });
    }
  }
  let swapTarget: string | null = null;
  if (kind === "ghost") {
    const spinner = slotSpinner(state);
    const others = slotActiveSeats(state).filter((uid) => uid !== spinner);
    swapTarget = others[random.int(0, others.length - 1)] ?? null;
  }
  return { kind, wild, coins, swapTarget };
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
  const symbol = SLOT_PAYTABLE.find((entry) => entry.kind === kind)?.symbol ?? "seven";
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

/**
 * The average share of the bill one pull allocates, in stakes, for a table
 * of `playerCount`, wilds included. The jackpot's refund and the ghost's
 * swap move nothing on average and are left out.
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
    if (entry.kind === "receipt") total += p * boost * Math.max(playerCount, 2);
  }
  return total;
}

/**
 * The same average per *regular* pull of a series, counting the free spins
 * that pulls set off along the way: cherries award free spins (twice as many
 * with a wild), a free spin's no-win costs nothing, and its coins fill a pot
 * the others pay.
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
  const coinsPerFreeSpin = 3 * (SLOT_COIN_CHANCE / 100) * coinValue;
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
  /** Coins collected during the current free spins; the others pay it when they run out. */
  coinPotMinor: number;
  /** Glücksklee: someone has to be picked to pay before the next pull. */
  pendingChoice: { uid: string; amountMinor: number } | null;
  /** The Risiko button is on offer: `uid` may stake `amountMinor` on a coin flip. */
  gamble: { uid: string; amountMinor: number; step: number } | null;
  spins: number;
}

export interface SlotCharge {
  uid: string;
  /** Positive: added to their tally. Negative: taken off it (a refund, a swap, a won gamble). */
  amountMinor: number;
}

export interface SlotSpinResult {
  spinner: string;
  kind: SlotOutcomeKind;
  faces: SlotFaces;
  /** A wild doubled this combination. */
  wild: boolean;
  /** Every tally change this pull caused, in the order they happened, pot payout included. */
  charges: SlotCharge[];
  /** After a jackpot left a single player at the machine: they took the rest of the bill. */
  lastPayer: string | null;
  /** This pull was one of the spinner's free spins: a no-win cost nothing. */
  freeSpin: boolean;
  /** Free spins this pull awarded (three cherries). */
  freeSpinsAwarded: number;
  /** Coins that landed on this free spin, and what they added to the pot. */
  coins: SlotCoin[];
  coinsCollectedMinor: number;
  /** The free spins ended with this pull and the pot was paid by the others. */
  potPayout: { totalMinor: number; charges: SlotCharge[] } | null;
  /** The ghost: who the spinner swapped with, and both tallies before the swap. */
  swap: { uid: string; spinnerBefore: number; otherBefore: number } | null;
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
    coinPotMinor: 0,
    pendingChoice: null,
    gamble: null,
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

/** Who the Glücksklee lets `uid` point at: everyone else still in the game. */
export function slotChoiceCandidates(state: SlotGameState, uid: string): string[] {
  return slotActiveSeats(state).filter((candidate) => candidate !== uid);
}

/** Tallies plus a capped `charge` helper, shared by every move that touches the bill. */
function ledger(state: SlotGameState) {
  const tallies: Record<string, number> = { ...state.tallies };
  const charges: SlotCharge[] = [];
  let remaining = slotRemaining(state);
  return {
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
  };
}

/** Splits `total` as evenly as minor units allow, the first in line taking the odd cents. */
function splitEvenly(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total % count ? 1 : 0));
}

/** Applies one pull with a known draw. `spinSlot` draws it; tests call this directly. */
export function applySlotDraw(
  state: SlotGameState,
  draw: SlotDraw,
  faces: SlotFaces,
): SlotSpinResult {
  if (isSlotGameOver(state)) throw new Error("The bill is already fully allocated");
  if (state.pendingChoice) throw new Error("Someone has to be picked to pay first");

  const spinner = slotSpinner(state);
  const freeSpin = state.freeSpinsLeft > 0;
  const books = ledger(state);
  const { tallies, charges } = books;
  let out = state.out;
  let lastPayer: string | null = null;
  let pendingChoice: SlotGameState["pendingChoice"] = null;
  let swap: SlotSpinResult["swap"] = null;
  const kind = draw.kind;
  const wild = draw.wild && SLOT_WILD_KINDS.has(kind);
  const stake = state.stakeMinor * (wild ? 2 : 1);
  const others = () => slotActiveSeats({ ...state, out }).filter((uid) => uid !== spinner);

  let spinnerCharged = 0;
  const multiplier = SPINNER_MULTIPLIER[kind];
  if (kind === "miss" && freeSpin) {
    // A free spin's stake is on the house.
  } else if (multiplier !== undefined) {
    spinnerCharged = books.charge(spinner, stake * multiplier);
  } else if (kind === "bells") {
    books.charge(nextSlotPlayer(state, spinner), stake * BELLS_MULTIPLIER);
  } else if (kind === "stars") {
    for (const uid of rotateFrom(state, spinner).slice(1)) books.charge(uid, stake);
  } else if (kind === "receipt") {
    for (const uid of rotateFrom(state, spinner)) books.charge(uid, stake);
  } else if (kind === "clover") {
    const candidates = others();
    if (candidates.length === 1) books.charge(candidates[0], stake * CLOVER_MULTIPLIER);
    else pendingChoice = { uid: spinner, amountMinor: stake * CLOVER_MULTIPLIER };
  } else if (kind === "ghost") {
    const target = draw.swapTarget ?? nextSlotPlayer(state, spinner);
    const spinnerBefore = tallies[spinner] ?? 0;
    const otherBefore = tallies[target] ?? 0;
    swap = { uid: target, spinnerBefore, otherBefore };
    for (const [uid, value] of [
      [spinner, otherBefore],
      [target, spinnerBefore],
    ] as const) {
      if (value > 0) tallies[uid] = value;
      else delete tallies[uid];
    }
    if (otherBefore !== spinnerBefore) {
      charges.push({ uid: spinner, amountMinor: otherBefore - spinnerBefore });
      charges.push({ uid: target, amountMinor: spinnerBefore - otherBefore });
    }
  } else if (kind === "jackpot") {
    books.refund(spinner, tallies[spinner] ?? 0);
    out = [...out, spinner];
    const stillIn = state.seats.filter((uid) => !out.includes(uid));
    if (stillIn.length === 1) {
      lastPayer = stillIn[0];
      books.charge(lastPayer, books.remaining());
    }
  }

  // Coins only pay on a free spin; they wait in the pot until the free spins run out.
  const coins = freeSpin ? draw.coins : [];
  const coinsCollectedMinor = coins.reduce(
    (sum, coin) => sum + coin.multiplier * state.stakeMinor,
    0,
  );
  let coinPotMinor = state.coinPotMinor + coinsCollectedMinor;

  const freeSpinsAwarded = kind === "cherries" ? SLOT_FREE_SPINS_AWARDED * (wild ? 2 : 1) : 0;
  const next: SlotGameState = {
    ...state,
    tallies,
    out,
    turnSpinsLeft: freeSpin ? state.turnSpinsLeft : state.turnSpinsLeft - 1,
    freeSpinsLeft: (freeSpin ? state.freeSpinsLeft - 1 : state.freeSpinsLeft) + freeSpinsAwarded,
    coinPotMinor,
    pendingChoice,
    gamble: null,
    spins: state.spins + 1,
  };
  const turnOver = out.includes(spinner) || (next.turnSpinsLeft <= 0 && next.freeSpinsLeft <= 0);

  // The free spins are over: everyone else pays the pot, split evenly.
  let potPayout: SlotSpinResult["potPayout"] = null;
  if (freeSpin && (next.freeSpinsLeft <= 0 || turnOver) && coinPotMinor > 0) {
    const payers = others();
    const shares = splitEvenly(coinPotMinor, Math.max(payers.length, 1));
    const potCharges: SlotCharge[] = [];
    payers.forEach((uid, index) => {
      const amount = books.charge(uid, shares[index]);
      if (amount > 0) potCharges.push({ uid, amountMinor: amount });
    });
    potPayout = { totalMinor: coinPotMinor, charges: potCharges };
    coinPotMinor = 0;
    next.coinPotMinor = 0;
  }

  const remaining = books.remaining();
  if (spinnerCharged > 0 && !freeSpin && remaining > 0) {
    next.gamble = { uid: spinner, amountMinor: spinnerCharged, step: 0 };
  }
  if (turnOver && remaining > 0) {
    next.turn = state.seats.indexOf(nextSlotPlayer(next, spinner));
    next.turnSpinsLeft = SLOT_SPINS_PER_TURN;
    next.freeSpinsLeft = 0;
    next.coinPotMinor = 0;
  }
  return {
    spinner,
    kind,
    faces,
    wild,
    charges,
    lastPayer,
    freeSpin,
    freeSpinsAwarded,
    coins,
    coinsCollectedMinor,
    potPayout,
    swap,
    state: next,
  };
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

/** A pull with a known outcome and nothing else random about it. Mostly for tests. */
export function applySlotOutcome(
  state: SlotGameState,
  kind: SlotOutcomeKind,
  faces: SlotFaces,
  extras: Partial<Omit<SlotDraw, "kind">> = {},
): SlotSpinResult {
  return applySlotDraw(state, { kind, wild: false, coins: [], swapTarget: null, ...extras }, faces);
}

/** One pull of the lever: draws everything random about it and applies it. */
export function spinSlot(state: SlotGameState, random: SlotRandom): SlotSpinResult {
  const draw = drawSlotSpin(state, random);
  return applySlotDraw(state, draw, slotReelFaces(draw.kind, random, draw.wild));
}

/** Glücksklee: the chooser points at `target`, who pays. */
export function applySlotChoice(
  state: SlotGameState,
  target: string,
): { state: SlotGameState; charge: SlotCharge | null } {
  const pending = state.pendingChoice;
  if (!pending) throw new Error("Nobody has a choice to make");
  if (!slotChoiceCandidates(state, pending.uid).includes(target)) {
    throw new Error("That person can't be picked");
  }
  const books = ledger(state);
  const amount = books.charge(target, pending.amountMinor);
  return {
    state: { ...state, tallies: books.tallies, pendingChoice: null },
    charge: amount > 0 ? { uid: target, amountMinor: amount } : null,
  };
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
  const books = ledger(state);
  if (won) {
    const amount = books.refund(gamble.uid, gamble.amountMinor);
    return {
      state: { ...state, tallies: books.tallies, gamble: null },
      charge: amount > 0 ? { uid: gamble.uid, amountMinor: -amount } : null,
    };
  }
  const extra = books.charge(gamble.uid, gamble.amountMinor);
  const step = gamble.step + 1;
  const again = step < SLOT_GAMBLE_MAX_STEPS && books.remaining() > 0;
  return {
    state: {
      ...state,
      tallies: books.tallies,
      gamble: again ? { uid: gamble.uid, amountMinor: gamble.amountMinor + extra, step } : null,
    },
    charge: extra > 0 ? { uid: gamble.uid, amountMinor: extra } : null,
  };
}

/** Draws the Risiko coin flip. */
export function drawSlotGamble(random: SlotRandom): boolean {
  return random.int(0, 1) === 1;
}
