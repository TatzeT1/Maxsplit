/**
 * Pure state machine that scales a 1-vs-1 duel (Tic-Tac-Toe, Connect Four,
 * Memory-Duell, Reaktionsduell) to a pool of any size, the same way the
 * wheel/scratch/lottery scale a random draw: pick a pool and how many should
 * pay, then resolve it down to that many loser uids.
 *
 * Two players duel; whoever loses is locked in as a payer and steps aside,
 * the winner stays on and immediately faces the next challenger drawn from
 * the pool — repeat until enough losers are found. For a pool of exactly 2
 * that's just one match. No randomness lives here: the caller draws the
 * initial `order` (via `secureShuffle`, so who plays whom first can't be
 * gamed), and every match's actual result comes from real play, never a
 * random draw — a "who pays" decision here is decided by skill, not chance.
 */

export interface DuelPairing {
  /** Changes on every new match AND every replay of a drawn match — the board's React `key`, so a draw always remounts a fresh board. */
  key: string;
  /** 1-based match number; equals `losers.length + 1` while the ladder is running. */
  matchNumber: number;
  /** 0 on a match's first try, +1 per replay after a draw. */
  attempt: number;
  /** The two players in this match. `players[1]` is the challenger drawn from the pool — see `startLadder`/`recordWin`. */
  players: [string, string];
}

export interface DuelResult {
  matchNumber: number;
  winnerUid: string;
  loserUid: string;
  /** How many tries (draws + the deciding one) this match took. */
  attempts: number;
}

export interface KnockoutLadderState {
  /** 0 while idle/not started. */
  targetLoserCount: number;
  current: DuelPairing | null;
  /** Challengers still waiting their turn, in draw order. */
  queue: string[];
  /** Elimination order — this is exactly the `loserUids` shape every other split mini-game already resolves to. */
  losers: string[];
  results: DuelResult[];
}

export const IDLE_LADDER: KnockoutLadderState = {
  targetLoserCount: 0,
  current: null,
  queue: [],
  losers: [],
  results: [],
};

/** At least one person has to stay unbeaten, same rule the other games use for their "how many pay" stepper. */
export function maxDuelLoserCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

export function clampDuelLoserCount(requested: number, poolSize: number): number {
  return Math.min(Math.max(requested, 1), maxDuelLoserCount(poolSize));
}

function pairingKey(matchNumber: number, attempt: number): string {
  return `${matchNumber}:${attempt}`;
}

/** `order` must already be shuffled — see the module doc. */
export function startLadder(order: string[], requestedLoserCount: number): KnockoutLadderState {
  if (order.length < 2) return IDLE_LADDER;
  const targetLoserCount = clampDuelLoserCount(requestedLoserCount, order.length);
  return {
    targetLoserCount,
    current: {
      key: pairingKey(1, 0),
      matchNumber: 1,
      attempt: 0,
      players: [order[0], order[1]],
    },
    queue: order.slice(2),
    losers: [],
    results: [],
  };
}

export function isLadderOver(state: KnockoutLadderState): boolean {
  return state.targetLoserCount > 0 && state.losers.length >= state.targetLoserCount;
}

/**
 * A draw replays the same match with the players swapped, so whoever went
 * second gets to start this time. Stale callbacks (from a board that already
 * got torn down) are ignored via the pairing key.
 */
export function recordDraw(state: KnockoutLadderState, key: string): KnockoutLadderState {
  if (!state.current || state.current.key !== key) return state;
  const { matchNumber, attempt, players } = state.current;
  return {
    ...state,
    current: {
      key: pairingKey(matchNumber, attempt + 1),
      matchNumber,
      attempt: attempt + 1,
      players: [players[1], players[0]],
    },
  };
}

/**
 * Records a match's winner: the loser is locked in, and the winner either
 * faces the next queued challenger or, if the target is reached (or no
 * challengers are left), the ladder is over.
 */
export function recordWin(
  state: KnockoutLadderState,
  key: string,
  winnerUid: string,
): KnockoutLadderState {
  if (!state.current || state.current.key !== key) return state;
  if (!state.current.players.includes(winnerUid)) return state;
  const { matchNumber, attempt, players } = state.current;
  const loserUid = players[0] === winnerUid ? players[1] : players[0];

  const losers = [...state.losers, loserUid];
  const results = [...state.results, { matchNumber, winnerUid, loserUid, attempts: attempt + 1 }];

  if (losers.length >= state.targetLoserCount || state.queue.length === 0) {
    return { ...state, current: null, queue: [], losers, results };
  }

  const [nextChallenger, ...rest] = state.queue;
  return {
    ...state,
    current: {
      key: pairingKey(matchNumber + 1, 0),
      matchNumber: matchNumber + 1,
      attempt: 0,
      // The challenger moves first — offsets the "stays on" player's advantage.
      players: [nextChallenger, winnerUid],
    },
    queue: rest,
    losers,
    results,
  };
}
