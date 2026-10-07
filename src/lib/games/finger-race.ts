import {
  REACTION_MAX_DELAY_MS,
  REACTION_MIN_DELAY_MS,
  REACTION_SETTLE_MS,
  REACTION_TIE_WINDOW_MS,
} from "@/lib/games/reaction-duel";

/**
 * Pure rules for „Finger drauf!“: the phone lies flat on the table, every
 * player rests one finger on their own circle, and after a random pause a
 * full-screen „LOS!“ tells everyone to lift. Lifting before the signal is a
 * false start and pays; otherwise the slowest fingers pay. It is the
 * Reaktionsduell (`reaction-duel.ts`) for the whole table at once, so it
 * shares that game's delay range and its 16 ms tie window.
 *
 * Two layers, both pure:
 *
 * - **A round** (`FingerRound`) is the touch bookkeeping. Each finger is
 *   tracked by its `pointerId` and belongs to the circle it came down on, for
 *   as long as it rests — sliding onto someone else's circle changes nothing.
 *   A second finger on a circle that is already held, a finger outside every
 *   circle, a finger once the race is armed: all ignored. The dialog forwards
 *   raw pointer events and timestamps and never decides anything itself.
 * - **A game** (`FingerGame`) is a series of rounds, like the dice cup's
 *   „Stechen“: a round either settles everyone, or names the players who must
 *   play again — and only they do — together with how many of them pay.
 *
 * Who pays out of one round (`judgeFingerRound`):
 *
 * 1. Lifted before „LOS!“ → false start → pays. If there are more false
 *    starters than payers, nobody else can pay: everyone else is safe and the
 *    false starters play again among themselves.
 * 2. The remaining payers are the slowest of the rest. A finger that never
 *    lifted is the slowest of all.
 * 3. Lifts closer together than the tie window can't be honestly ordered by
 *    touch hardware. A player is settled only if the order *around* them is
 *    certain — enough people certainly faster (pays) or certainly slower
 *    (safe). Whoever is left over is on the paying line and plays again.
 *
 * A round closes as soon as its outcome can't change any more
 * (`fingerRoundSettled`): once the false starts alone decide it, or once every
 * finger still down is certain to pay — a finger that lifts later is only
 * ever slower. The table sees the verdict while the slowest finger is still
 * on the glass, and nobody waits out a dawdler.
 *
 * A `pointercancel` is the system taking a finger away (an iPhone tracks five
 * touches and cancels them all on a sixth, a system gesture, a palm). It is
 * never a lift: until the round has closed it voids the race. False starts
 * made before it stand — those fingers came off by their owners' doing — and
 * everyone else plays again. After the round has closed it changes nothing,
 * so the person about to pay can't wipe the result with their palm.
 */

/** An iPhone tracks five touches at once; more fingers than that cancel them all. */
export const FINGER_MAX_PLAYERS = 5;
/** How long every finger has to rest, untouched, before the round arms. */
export const FINGER_REST_MS = 600;
/** The armed pause before „LOS!“ — the duel's range, drawn with `randomInt` so it can't be anticipated. */
export const FINGER_MIN_DELAY_MS = REACTION_MIN_DELAY_MS;
export const FINGER_MAX_DELAY_MS = REACTION_MAX_DELAY_MS;
/** Lifts this close together are a dead heat, as in the duel. */
export const FINGER_TIE_WINDOW_MS = REACTION_TIE_WINDOW_MS;
/**
 * After the false start that decides a round, how long a near-simultaneous
 * one still counts — and, after a lift, how long the dialog waits before
 * asking whether the round is settled, so a lift the browser delivers a
 * frame late is still in.
 */
export const FINGER_SETTLE_MS = REACTION_SETTLE_MS;
/** After „LOS!“, how long to wait for the last finger before it counts as never lifted. */
export const FINGER_LIFT_TIMEOUT_MS = 3000;

/**
 * How many people this device can hold at once. `navigator.maxTouchPoints`
 * is 0 without a touchscreen (or when unknown), which is no reason to refuse
 * a group of five, so it falls back to the iPhone's limit.
 */
export function fingerPoolLimit(maxTouchPoints: number | null | undefined): number {
  const touches =
    typeof maxTouchPoints === "number" && maxTouchPoints > 0
      ? Math.floor(maxTouchPoints)
      : FINGER_MAX_PLAYERS;
  return Math.min(FINGER_MAX_PLAYERS, touches);
}

/** At least one person stays dry. */
export function maxFingerLoserCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

/**
 * - `gather` — fingers come and go freely, nothing counts yet.
 * - `steady` — every finger has rested `FINGER_REST_MS`; the hidden pause runs
 *   and a lift is a false start.
 * - `go` — „LOS!“ is on screen; lifts are timed.
 * - `closed` — judged; nothing changes any more.
 */
export type FingerPhase = "gather" | "steady" | "go" | "closed";

export interface RestingFinger {
  pointerId: number;
  /** The circle it came down on. */
  uid: string;
  downAt: number;
}

export interface FingerRound {
  phase: FingerPhase;
  /** Who plays this round, in seat order. */
  contenders: readonly string[];
  /** How many of them pay. */
  slots: number;
  /** One per held circle. */
  fingers: readonly RestingFinger[];
  /** When „LOS!“ appeared (same clock as the pointer timestamps); `null` before. */
  signalAt: number | null;
  /** When each finger came off once the round was armed — false starts included. */
  lifts: Readonly<Record<string, number>>;
  /** A finger was cancelled by the system while the race was on. */
  voided: boolean;
}

export function startFingerRound(contenders: readonly string[], slots: number): FingerRound {
  return {
    phase: "gather",
    contenders: [...contenders],
    slots,
    fingers: [],
    signalAt: null,
    lifts: {},
    voided: false,
  };
}

/** Whose circle is held right now. */
export function heldCircle(round: FingerRound, uid: string): boolean {
  return round.fingers.some((finger) => finger.uid === uid);
}

/**
 * A finger comes down on `uid`'s circle. Only while gathering, only on a
 * contender's circle that nobody holds yet; anything else returns `round`
 * itself unchanged, so the caller can tell an ignored touch by identity.
 */
export function fingerDown(
  round: FingerRound,
  pointerId: number,
  uid: string,
  at: number,
): FingerRound {
  if (round.phase !== "gather" || !round.contenders.includes(uid)) return round;
  if (round.fingers.some((finger) => finger.pointerId === pointerId || finger.uid === uid)) {
    return round;
  }
  return { ...round, fingers: [...round.fingers, { pointerId, uid, downAt: at }] };
}

/**
 * A finger comes off. While gathering it just frees its circle; once armed
 * the lift is recorded (before the signal, that is a false start). An
 * untracked pointer — an extra finger, a finger outside the circles — is
 * ignored and `round` comes back unchanged.
 */
export function fingerUp(round: FingerRound, pointerId: number, at: number): FingerRound {
  const finger = round.fingers.find((candidate) => candidate.pointerId === pointerId);
  if (!finger) return round;
  const fingers = round.fingers.filter((candidate) => candidate !== finger);
  if (round.phase === "steady" || round.phase === "go") {
    return { ...round, fingers, lifts: { ...round.lifts, [finger.uid]: at } };
  }
  return { ...round, fingers };
}

/**
 * The system took a finger away (`pointercancel`). Never a false start: while
 * gathering the circle is simply free again, during the race the race is void
 * and the round closes.
 */
export function fingerCancel(round: FingerRound, pointerId: number): FingerRound {
  const finger = round.fingers.find((candidate) => candidate.pointerId === pointerId);
  if (!finger) return round;
  const fingers = round.fingers.filter((candidate) => candidate !== finger);
  if (round.phase === "steady" || round.phase === "go") {
    return { ...round, fingers, phase: "closed", voided: true };
  }
  return { ...round, fingers };
}

/**
 * While gathering with every contender's finger down: when the last of them
 * came down. The round arms `FINGER_REST_MS` after that. `null` otherwise.
 */
export function allRestingSince(round: FingerRound): number | null {
  if (round.phase !== "gather") return null;
  let latest = -Infinity;
  for (const uid of round.contenders) {
    const finger = round.fingers.find((candidate) => candidate.uid === uid);
    if (!finger) return null;
    latest = Math.max(latest, finger.downAt);
  }
  return latest;
}

/** Every finger has rested long enough: the hidden pause starts and lifting now is a false start. */
export function armFingerRound(round: FingerRound, at: number): FingerRound {
  const since = allRestingSince(round);
  if (since === null || at - since < FINGER_REST_MS) return round;
  return { ...round, phase: "steady" };
}

/** „LOS!“ */
export function signalFingerRound(round: FingerRound, at: number): FingerRound {
  if (round.phase !== "steady") return round;
  return { ...round, phase: "go", signalAt: at };
}

export function closeFingerRound(round: FingerRound): FingerRound {
  if (round.phase === "closed") return round;
  return { ...round, phase: "closed" };
}

/** Who lifted before „LOS!“, earliest first (seat order among exact ties). */
export function falseStarters(
  round: Pick<FingerRound, "contenders" | "signalAt" | "lifts">,
): string[] {
  const { signalAt, lifts } = round;
  return round.contenders
    .filter((uid) => uid in lifts && (signalAt === null || lifts[uid] < signalAt))
    .sort((a, b) => lifts[a] - lifts[b]);
}

/**
 * The false starts alone already decide the round: as many as (or more than)
 * there are payers. „LOS!“ is off; the round closes `FINGER_SETTLE_MS` after
 * the deciding one, so a lift in the same instant still counts as one of them.
 */
export function falseStartsDecide(round: FingerRound): boolean {
  return (
    (round.phase === "steady" || round.phase === "go") && falseStarters(round).length >= round.slots
  );
}

/**
 * Whether the outcome of an open round can no longer change, so it may close
 * at `now` (same clock as the lifts):
 *
 * - the false starts decide it, and the deciding one is `FINGER_SETTLE_MS`
 *   old; or
 * - after „LOS!“, every lift is older than the tie window — a finger still
 *   down can't draw level with any of them any more — and every finger still
 *   down pays anyway. Lifting later only ever makes it slower, so nothing
 *   left to happen can change who pays. With every finger up, that is simply
 *   "the last lift has had its tie window".
 */
export function fingerRoundSettled(round: FingerRound, now: number): boolean {
  if (round.phase !== "steady" && round.phase !== "go") return false;
  const early = falseStarters(round);
  if (early.length >= round.slots) {
    return now - round.lifts[early[round.slots - 1]] >= FINGER_SETTLE_MS;
  }
  const { signalAt, lifts } = round;
  if (round.phase !== "go" || signalAt === null) return false;
  const lastLift = Math.max(
    -Infinity,
    ...round.contenders.map((uid) => lifts[uid] ?? -Infinity).filter((at) => at >= signalAt),
  );
  if (now - lastLift <= FINGER_TIE_WINDOW_MS) return false;
  const { losers } = judgeFingerRound(round);
  return round.contenders.every((uid) => uid in lifts || losers.includes(uid));
}

/** How long after „LOS!“ `uid` lifted, in whole ms; `null` for a false start, no lift or no signal. */
export function liftMs(round: Pick<FingerRound, "signalAt" | "lifts">, uid: string): number | null {
  const lift = round.lifts[uid];
  if (round.signalAt === null || lift === undefined || lift < round.signalAt) return null;
  return Math.round(lift - round.signalAt);
}

export type FingerReplayReason = "falseStarts" | "tooClose" | "voided";

export interface FingerVerdict {
  /** Pay, for certain: the false starters first, then the slow ones, slowest last. */
  losers: string[];
  /** Safe, for certain. */
  safe: string[];
  /** Must play again, and only they, in seat order. Empty once the round settled everything. */
  tied: string[];
  /** How many of `tied` will pay. */
  tiedSlots: number;
  /** Who lifted before „LOS!“, earliest first. */
  falseStarts: string[];
  /** Why `tied` plays again; `null` when nobody does. */
  replay: FingerReplayReason | null;
}

/** Who pays out of one closed round — see the module comment for the rules. */
export function judgeFingerRound(round: FingerRound): FingerVerdict {
  const { contenders, slots, signalAt, lifts } = round;
  const falseStarts = falseStarters(round);
  const others = contenders.filter((uid) => !falseStarts.includes(uid));

  if (falseStarts.length > slots) {
    return {
      losers: [],
      safe: others,
      tied: contenders.filter((uid) => falseStarts.includes(uid)),
      tiedSlots: slots,
      falseStarts,
      replay: "falseStarts",
    };
  }
  const left = slots - falseStarts.length;
  if (left === 0) {
    return { losers: falseStarts, safe: others, tied: [], tiedSlots: 0, falseStarts, replay: null };
  }
  if (round.voided || signalAt === null) {
    return {
      losers: falseStarts,
      safe: [],
      tied: others,
      tiedSlots: left,
      falseStarts,
      replay: "voided",
    };
  }

  const time = (uid: string) => lifts[uid] ?? Infinity;
  // `a` lifted before `b` by more than the hardware can blur. A finger that
  // never lifted is certainly slower than any that did; two that never lifted
  // are level.
  const certainlyFaster = (a: string, b: string) =>
    time(b) === Infinity ? time(a) !== Infinity : time(b) - time(a) > FINGER_TIE_WINDOW_MS;
  const fasterThan = (uid: string) => others.filter((other) => certainlyFaster(other, uid)).length;
  const slowerThan = (uid: string) => others.filter((other) => certainlyFaster(uid, other)).length;
  const byTime = (a: string, b: string) => time(a) - time(b) || 0;

  // Settled only where the order around them is certain. The two counts can
  // never overlap, and when nobody is left over they add up to `left` payers.
  const slow = others.filter((uid) => fasterThan(uid) >= others.length - left).sort(byTime);
  const safe = others.filter((uid) => slowerThan(uid) >= left).sort(byTime);
  const tied = others.filter((uid) => !slow.includes(uid) && !safe.includes(uid));
  return {
    losers: [...falseStarts, ...slow],
    safe,
    tied,
    tiedSlots: left - slow.length,
    falseStarts,
    replay: tied.length > 0 ? "tooClose" : null,
  };
}

/** A closed round as the game keeps it, for showing how it went. */
export interface FingerRoundRecord {
  contenders: string[];
  slots: number;
  signalAt: number | null;
  lifts: Record<string, number>;
  verdict: FingerVerdict;
}

export interface FingerGame {
  /** Who plays the next round: the whole pool first, later only the players who must play again. */
  contenders: string[];
  /** How many of the contenders will pay. */
  slots: number;
  losers: string[];
  safe: string[];
  rounds: FingerRoundRecord[];
}

export function startFingerGame(pool: readonly string[], payers: number): FingerGame {
  const slots = Math.min(Math.max(Math.trunc(payers), 1), maxFingerLoserCount(pool.length));
  return { contenders: [...pool], slots, losers: [], safe: [], rounds: [] };
}

export function isFingerGameOver(game: FingerGame): boolean {
  return game.contenders.length === 0;
}

/** The round the game plays next, or `null` once it is over. */
export function nextFingerRound(game: FingerGame): FingerRound | null {
  return isFingerGameOver(game) ? null : startFingerRound(game.contenders, game.slots);
}

/**
 * Judges a closed round and carries the game on: its settled players join
 * `losers` / `safe`, its tied ones are the next round's contenders. A round
 * that isn't closed, or wasn't played by the game's current contenders, is
 * ignored.
 */
export function recordFingerRound(game: FingerGame, round: FingerRound): FingerGame {
  if (round.phase !== "closed" || round.slots !== game.slots) return game;
  if (
    round.contenders.length !== game.contenders.length ||
    round.contenders.some((uid) => !game.contenders.includes(uid))
  ) {
    return game;
  }
  const verdict = judgeFingerRound(round);
  return {
    contenders: verdict.tied,
    slots: verdict.tiedSlots,
    losers: [...game.losers, ...verdict.losers],
    safe: [...game.safe, ...verdict.safe],
    rounds: [
      ...game.rounds,
      {
        contenders: [...round.contenders],
        slots: round.slots,
        signalAt: round.signalAt,
        lifts: { ...round.lifts },
        verdict,
      },
    ],
  };
}

export type FingerCatch = { kind: "falseStart" } | { kind: "slow"; ms: number | null };

/** How `uid` came to pay: a false start, or too slow (with their time; `null` if they never lifted). */
export function fingerCatch(game: FingerGame, uid: string): FingerCatch | null {
  for (const record of game.rounds) {
    if (!record.verdict.losers.includes(uid)) continue;
    if (record.verdict.falseStarts.includes(uid)) return { kind: "falseStart" };
    return { kind: "slow", ms: liftMs(record, uid) };
  }
  return null;
}

export interface FingerStanding {
  uid: string;
  pays: boolean;
  /** The round (0-based) that settled them. */
  round: number;
  falseStart: boolean;
  /** Their time in that round; `null` for a false start, no lift, or a round that ended before „LOS!“. */
  ms: number | null;
}

/**
 * Everyone settled so far, fastest first: whoever a round let go comes before
 * whoever it kept for the next one, and whoever it made pay comes after them
 * — so the safe players run in round order, the payers in reverse, the slow
 * by their time and the false starters last within their round.
 */
export function fingerStandings(game: FingerGame): FingerStanding[] {
  const settled = (pays: boolean) =>
    game.rounds.map((record, round) =>
      (pays ? record.verdict.losers : record.verdict.safe)
        .map((uid) => ({
          uid,
          pays,
          round,
          falseStart: record.verdict.falseStarts.includes(uid),
          ms: liftMs(record, uid),
        }))
        .sort(
          (a, b) =>
            Number(a.falseStart) - Number(b.falseStart) ||
            (a.ms ?? Infinity) - (b.ms ?? Infinity) ||
            0,
        ),
    );
  return [...settled(false).flat(), ...settled(true).reverse().flat()];
}

/** Where a player's circle sits on the field, as fractions of its width and height. */
export interface FingerSeat {
  x: number;
  y: number;
  /** Degrees to turn the circle's face and name so it reads from the nearest edge. */
  rotate: number;
}

/** The ellipse the circles sit on, as fractions of the field's width and height. */
const SEAT_RADIUS_X = 0.3;
const SEAT_RADIUS_Y = 0.33;

/**
 * The circles around a phone lying flat in the middle of the table: evenly
 * round an ellipse, the first seat at the bottom edge and the rest clockwise
 * — two players face each other across it, as in the duel. Each face is
 * turned to read from the edge it is nearest to, for whoever sits there.
 */
export function fingerSeats(count: number): FingerSeat[] {
  return Array.from({ length: count }, (_, index) => {
    const degrees = 90 + (index * 360) / count;
    const radians = (degrees * Math.PI) / 180;
    // Rounded so the layout is stable to the pixel (and readable in a test).
    const round = (value: number) => Math.round(value * 1e4) / 1e4;
    const rotate = ((((degrees - 90) % 360) + 540) % 360) - 180;
    return {
      x: round(0.5 + SEAT_RADIUS_X * Math.cos(radians)),
      y: round(0.5 + SEAT_RADIUS_Y * Math.sin(radians)),
      rotate: rotate === -180 ? 180 : rotate,
    };
  });
}
