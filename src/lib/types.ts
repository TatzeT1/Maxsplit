export type GroupRole = "owner" | "admin" | "member";

export interface GroupMember {
  displayName: string;
  photoURL: string;
  joinedAt: string;
  role: GroupRole;
  /**
   * True for a member added by name only, with no Firebase Auth account
   * behind them yet — lets a group's expenses/balances be correct before
   * everyone has actually joined. Never present in `memberUids` (that array
   * is real, authenticated members only, since it's what Firestore rules
   * check). Absent (not just false) on every member created before this
   * field existed; always read it as `member.isPlaceholder === true`; never
   * assume the field exists.
   */
  isPlaceholder: boolean;
  /** Denormalized copy of the owning user's payment details, kept in sync by updatePaymentDetails (lib/actions/profile.ts). Absent/empty when not set. */
  paypalEmail?: string;
  /** @see paypalEmail */
  iban?: string;
  /** PayPal.Me username only (e.g. "maxrobin"), no URL — see buildPaypalMeLink (lib/payment/paypal-me.ts). @see paypalEmail */
  paypalMeHandle?: string;
}

export interface Group {
  id: string;
  name: string;
  /** User-chosen emoji shown instead of the initial-letter avatar. Null/absent falls back to the initial letter. */
  icon?: string | null;
  currency: string;
  createdBy: string;
  createdAt: string;
  archived: boolean;
  memberUids: string[];
  members: Record<string, GroupMember>;
  inviteCode: string;
  /**
   * Opaque token gating the public, unauthenticated settlement PDF link
   * (see /share/settlement/[groupId]/[token]). Generated lazily on first
   * request — absent until then, never regenerated automatically.
   */
  settlementShareToken?: string;
  /**
   * Cached copy of `computeBalances(expenses, settlements)`, keyed by uid —
   * a display-only convenience so the groups list can show "you owe X"
   * without subscribing to every group's full ledger. Written exclusively by
   * `recomputeGroupBalances` (lib/money/balance-cache.ts) from the Server
   * Actions that mutate expenses/settlements; never a source of truth (the
   * group detail page still recomputes from the live ledger). Absent on
   * groups created before this field existed, until their next mutation.
   */
  balancesMinor?: Record<string, number>;
}

export interface ExpenseSplit {
  rawValue: number;
  amountMinor: number;
}

export type SplitMode = "equal" | "shares" | "percent" | "exact";

export type CategoryId =
  | "groceries"
  | "restaurant"
  | "transport"
  | "housing"
  | "utilities"
  | "entertainment"
  | "travel"
  | "shopping"
  | "health"
  | "other";

export interface Expense {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: CategoryId | null;
  /** User-chosen override shown instead of the category icon. Absent on expenses created before this field existed. */
  emoji?: string | null;
  paidBy: Record<string, number>;
  splitMode: SplitMode;
  splits: Record<string, ExpenseSplit>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /**
   * True when this expense's split was decided by the 🎲 Split Lottery game
   * (split-lottery-dialog.tsx) rather than chosen manually. Only set going
   * forward — expenses split via the lottery before this field existed have
   * no such marker, so the "vergambelt" leaderboard starts counting from
   * here, not retroactively. Absent (not false) on older expenses.
   */
  viaLottery?: boolean;
}

export interface Settlement {
  id: string;
  fromUid: string;
  toUid: string;
  amountMinor: number;
  currency: string;
  date: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Records edit/delete history for expenses and settlements. "Added" isn't
 * logged — the row itself already signals that, so a log entry would just
 * duplicate it right next to the row that shows the same thing in full.
 */
export type ActivityLogType =
  "expense_edited" | "expense_deleted" | "settlement_edited" | "settlement_deleted";

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  actorUid: string;
  description: string;
  createdAt: string;
}

/** A single message in a group's chat (`groups/{groupId}/messages`). Text only for v1 — no attachments, edits, or reactions. */
export interface ChatMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: string;
}

/**
 * Per-member read receipt (`groups/{groupId}/chatReads/{uid}`), doc id ==
 * uid so a member can only ever hold one. Drives the unread badge: a group
 * has unread chat activity for a member when this is older than the newest
 * message's `createdAt` (or absent entirely).
 */
export interface ChatRead {
  lastReadAt: string;
}

/** The four 1-vs-1 duel split mini-games that can run as a tournament bracket — see [[Split Games]]. */
export type DuelGameId = "tictactoe" | "connectfour" | "memory" | "reaction";

export type TournamentStatus = "running" | "finished" | "cancelled";

/**
 * Which side of a match advances further into the bracket. "loser" ("Verlierer
 * spielt weiter"): the match winner is safe and done, the loser keeps playing —
 * whoever loses a tree's final match pays. "winner" (classic): the match
 * winner advances, the loser is immediately locked in as a payer — whoever
 * wins a tree's final goes free. `createBracket` (lib/games/tournament-bracket.ts)
 * picks the mode automatically from how many people should pay.
 */
export type TournamentAdvance = "loser" | "winner";

export type TournamentMatchStatus = "waiting" | "ready" | "playing" | "done";

/** Where one of a match's two players comes from: a raw entrant (including a bye), or another match's advancing player. */
export type TournamentSlotSource =
  { kind: "entrant"; uid: string } | { kind: "match"; matchId: string };

export interface TournamentMatch {
  id: string;
  treeIndex: number;
  /** 1-based "height" in its tree — every match playable immediately at the start is round 1. Drives the bracket drawing's column. */
  round: number;
  sources: [TournamentSlotSource, TournamentSlotSource];
  /** Resolved uids once known; `null` while waiting on a source match to finish. `players[0]` moves/goes first. */
  players: [string | null, string | null];
  /** Where this match's advancing player goes next; `null` for a tree's final match. */
  next: { matchId: string; slot: 0 | 1 } | null;
  status: TournamentMatchStatus;
  /** The device currently holding this match, so a second phone can't start the same match twice. */
  claim: { byUid: string; claimId: string; claimedAt: string } | null;
  result: {
    winnerUid: string;
    loserUid: string;
    /** How many tries (local draw replays + the deciding one) this match took. */
    attempts: number;
    reportedBy: string;
    finishedAt: string;
  } | null;
}

/**
 * A live tournament bracket for one of the duel split mini-games
 * (`groups/{groupId}/tournaments/{tournamentId}`) — see [[Split Games]].
 * Every device subscribes to this one document via `onSnapshot`; the loser
 * set it produces feeds into `resolveExpense`/`buildSplits` exactly like
 * every other split mini-game's `onResolve(loserUids)`.
 */
export interface Tournament {
  id: string;
  gameId: DuelGameId;
  status: TournamentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  /** Name snapshot at creation time, so the bracket still renders correctly if a member later leaves the group. */
  entrants: Record<string, { displayName: string; isPlaceholder: boolean }>;
  /** The server's crypto-shuffled draw order, kept for reference — who plays whom is derived from this, not re-randomized on the client. */
  seedOrder: string[];
  targetLoserCount: number;
  advance: TournamentAdvance;
  trees: { entrantUids: string[]; finalMatchId: string }[];
  matches: Record<string, TournamentMatch>;
  /** Set once every tree's final has a result — exactly the `loserUids` shape every other split mini-game resolves to. */
  loserUids: string[] | null;
  /** Display-only context for the tournament screen ("Pizza · 42,00 €"); not itself the expense split. */
  stake: { description: string; amountMinor: number; currency: string } | null;
}

export type RecurringFrequency = "weekly" | "monthly";

export interface RecurringRule {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  category: CategoryId | null;
  paidBy: Record<string, number>;
  splitMode: SplitMode;
  splits: Record<string, ExpenseSplit>;
  frequency: RecurringFrequency;
  /** Immutable anchor date — its day-of-month is what monthly rollovers target. */
  startDate: string;
  /** Mutates forward each time the rule materializes an expense. */
  nextRunDate: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}
