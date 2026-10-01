/**
 * Pure Spielautomat rules. Everyone takes turns at one machine, in an order
 * shuffled once at the start, and every pull lands on a combination from the
 * paytable below. The combination decides what happens to the bill: the
 * spinner pays their stake, gets it back, pays a multiple of it, hands it on
 * to the next player, buys a round for everyone else, or hits the jackpot and
 * walks away with everything they paid so far refunded.
 *
 * Everyone spins equally often, so in expectation it's fair, but a single
 * game can swing hard either way, which is the point. Whatever happens, every
 * charge is capped to what's still open, so the tallies always add up to
 * exactly `amountMinor` once the game is over.
 *
 * The outcome is drawn first and the reel faces are built to show it, the
 * same "decide first, animate after" pattern the other luck games use.
 * Randomness comes in through `SlotRandom` so the module stays deterministic
 * and unit-testable; the dialog passes crypto-backed helpers (`random.ts`).
 */

export type SlotSymbol = "cherry" | "lemon" | "bell" | "star" | "bomb" | "seven";

export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  "cherry",
  "lemon",
  "bell",
  "star",
  "bomb",
  "seven",
];

export const SLOT_SYMBOL_EMOJI: Record<SlotSymbol, string> = {
  cherry: "🍒",
  lemon: "🍋",
  bell: "🔔",
  star: "⭐",
  bomb: "💣",
  seven: "7️⃣",
};

export type SlotOutcomeKind =
  "miss" | "pair" | "lemons" | "cherries" | "bells" | "stars" | "bombs" | "jackpot";

export interface SlotPaytableEntry {
  kind: SlotOutcomeKind;
  /** Out of `SLOT_TOTAL_WEIGHT`, i.e. a percentage. */
  weight: number;
  /** The symbol that has to line up three times, for the three-of-a-kind rows. */
  symbol: SlotSymbol | null;
}

/** Ordered from the most to the least likely, which is also how the paytable is shown. */
export const SLOT_PAYTABLE: readonly SlotPaytableEntry[] = [
  { kind: "miss", weight: 52, symbol: null },
  { kind: "pair", weight: 26, symbol: null },
  { kind: "lemons", weight: 6, symbol: "lemon" },
  { kind: "cherries", weight: 5, symbol: "cherry" },
  { kind: "bells", weight: 4, symbol: "bell" },
  { kind: "stars", weight: 4, symbol: "star" },
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

export interface SlotRandom {
  /** A uniform integer in `[min, max]`, both ends included. */
  int(min: number, max: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export type SlotFaces = readonly [SlotSymbol, SlotSymbol, SlotSymbol];

export function drawSlotOutcome(random: SlotRandom): SlotOutcomeKind {
  let roll = random.int(1, SLOT_TOTAL_WEIGHT);
  for (const entry of SLOT_PAYTABLE) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return "miss";
}

/**
 * Reel faces that show `kind`. A pair puts its odd symbol on a random reel,
 * so a third of all pairs line up on the first two reels and get the slow,
 * drum-rolled third reel, which is where the near misses come from.
 */
export function slotReelFaces(kind: SlotOutcomeKind, random: SlotRandom): SlotFaces {
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
  return [symbol, symbol, symbol];
}

/** Reads a combination back off the reels: the inverse of `slotReelFaces`. */
export function slotOutcomeForFaces(faces: SlotFaces): SlotOutcomeKind {
  const [a, b, c] = faces;
  if (a === b && b === c) {
    return SLOT_PAYTABLE.find((entry) => entry.symbol === a)?.kind ?? "miss";
  }
  if (a === b || b === c || a === c) return "pair";
  return "miss";
}

/**
 * The average share of the bill one pull allocates, in stakes, for a table
 * of `playerCount`. The jackpot's refund is left out: at 1 % it barely moves
 * the average, and leaving it out keeps the estimate on the short side.
 */
export function expectedStakesPerSpin(playerCount: number): number {
  let total = 0;
  for (const entry of SLOT_PAYTABLE) {
    const p = entry.weight / SLOT_TOTAL_WEIGHT;
    total += p * (SPINNER_MULTIPLIER[entry.kind] ?? 0);
    if (entry.kind === "bells") total += p * BELLS_MULTIPLIER;
    if (entry.kind === "stars") total += p * Math.max(playerCount - 1, 1);
  }
  return total;
}

export type SlotDuration = "short" | "normal" | "long";

/** Roughly how many times around the table a game lasts, per duration. */
export const SLOT_DURATION_ROUNDS: Record<SlotDuration, number> = {
  short: 2,
  normal: 4,
  long: 7,
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
  const spins = playerCount * SLOT_DURATION_ROUNDS[duration];
  const raw = amountMinor / (spins * expectedStakesPerSpin(playerCount));
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
  /** What each person owes so far. Never negative; a jackpot winner's entry is removed. */
  tallies: Readonly<Record<string, number>>;
  /** The person at the machine won a free spin and pulls again before passing on. */
  freeSpin: boolean;
  spins: number;
}

export interface SlotCharge {
  uid: string;
  /** Positive: added to their tally. Negative: a jackpot refund. */
  amountMinor: number;
}

export interface SlotSpinResult {
  spinner: string;
  kind: SlotOutcomeKind;
  faces: SlotFaces;
  /** Every tally change this pull caused, in the order they happened. */
  charges: SlotCharge[];
  /** After a jackpot left a single player at the machine: they took the rest of the bill. */
  lastPayer: string | null;
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
    freeSpin: false,
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

/** Applies one pull with a known outcome. `spinSlot` draws the outcome; tests call this directly. */
export function applySlotOutcome(
  state: SlotGameState,
  kind: SlotOutcomeKind,
  faces: SlotFaces,
): SlotSpinResult {
  if (isSlotGameOver(state)) throw new Error("The bill is already fully allocated");

  const spinner = slotSpinner(state);
  const tallies: Record<string, number> = { ...state.tallies };
  let out = state.out;
  let remaining = slotRemaining(state);
  const charges: SlotCharge[] = [];
  let lastPayer: string | null = null;

  const charge = (uid: string, wanted: number) => {
    const amount = Math.min(wanted, remaining);
    if (amount <= 0) return;
    tallies[uid] = (tallies[uid] ?? 0) + amount;
    remaining -= amount;
    charges.push({ uid, amountMinor: amount });
  };

  const stake = state.stakeMinor;
  const multiplier = SPINNER_MULTIPLIER[kind];
  if (multiplier !== undefined) {
    charge(spinner, stake * multiplier);
  } else if (kind === "bells") {
    charge(nextSlotPlayer(state, spinner), stake * BELLS_MULTIPLIER);
  } else if (kind === "stars") {
    let uid = nextSlotPlayer(state, spinner);
    while (uid !== spinner) {
      charge(uid, stake);
      uid = nextSlotPlayer(state, uid);
    }
  } else if (kind === "jackpot") {
    const refund = tallies[spinner] ?? 0;
    delete tallies[spinner];
    remaining += refund;
    if (refund > 0) charges.push({ uid: spinner, amountMinor: -refund });
    out = [...out, spinner];
    const stillIn = state.seats.filter((uid) => !out.includes(uid));
    if (stillIn.length === 1) {
      lastPayer = stillIn[0];
      charge(lastPayer, remaining);
    }
  }

  const freeSpin = kind === "cherries" && remaining > 0;
  const next: SlotGameState = { ...state, tallies, out, freeSpin, spins: state.spins + 1 };
  if (!freeSpin && remaining > 0) {
    next.turn = state.seats.indexOf(nextSlotPlayer(next, spinner));
  }
  return { spinner, kind, faces, charges, lastPayer, state: next };
}

/** One pull of the lever: draws a combination and applies it. */
export function spinSlot(state: SlotGameState, random: SlotRandom): SlotSpinResult {
  const kind = drawSlotOutcome(random);
  return applySlotOutcome(state, kind, slotReelFaces(kind, random));
}
