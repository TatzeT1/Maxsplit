import type { RpsRound } from "@/lib/games/rock-paper-scissors";

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
  /**
   * The IBAN's account holder as the bank knows them, for the GiroCode's
   * recipient name — banks check that name against the IBAN before a SEPA
   * transfer ("Empfängerüberprüfung"), and a display name like "Max" won't
   * match. Absent means "use displayName". @see paypalEmail
   */
  accountHolderName?: string;
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
  /**
   * The online luck round running in this group, if any — lets the group
   * page show its banner without another listener. Set and cleared by
   * `lib/actions/luck-rounds.ts` with the round itself. Absent on groups that
   * never played one.
   */
  activeLuckRound?: { id: string; gameId: OnlineLuckGameId } | null;
  /**
   * The online estimate round running in this group, if any — lets the group
   * page show its banner without another listener. Set and cleared by
   * `lib/actions/estimate-rounds.ts` with the round itself. Absent on groups
   * that never played one.
   */
  activeEstimateRound?: { id: string } | null;
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
   * True when this expense's split was decided by one of the split games
   * (the name predates all but the 🎲 lottery) rather than chosen manually.
   * Only set going forward — expenses split via a game before this field
   * existed have no such marker, so the "vergambelt" leaderboard starts
   * counting from here, not retroactively. Absent (not false) on older
   * expenses.
   */
  viaLottery?: boolean;
  /**
   * Which game decided the split, who played and in which attempt — only
   * alongside `viaLottery`. Absent on expenses from before 2026-10, `null`
   * once an edit replaced the game's split by hand.
   */
  game?: ExpenseGame | null;
}

/** The game behind a game-decided expense — see `Expense.game`. */
export interface ExpenseGame {
  gameId: SplitGameId;
  /** Everyone in the game's pool: whoever pays plus whoever got away. */
  playerUids: string[];
  /**
   * How many rounds this expense form had started when this result was
   * taken: 1 = the first one counted, 3 = it was reshuffled twice. Visible,
   * so "play until someone else pays" can't happen unnoticed.
   */
  attempt: number;
  /**
   * Estimate only. SERVER-written (the online booking, or the verified claim
   * of a finished one-phone round in `addExpense`). A client-sent value is
   * dropped by `normalizeExpenseGame`.
   */
  estimate?: EstimateAudit;
}

/**
 * What the client sends as `ExpenseInput.game`. The one-phone claim id travels
 * beside the record, is verified by the server and is never stored:
 * `editExpense` stores the normalized `game` verbatim, so the id must not live
 * inside it. See `normalizeExpenseGame`.
 */
export interface ExpenseGameInput {
  gameId: SplitGameId;
  playerUids: string[];
  attempt: number;
  estimateRoundId?: string;
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
 * Undoing a deletion is logged, though: otherwise the earlier "deleted"
 * entry would stand alone and claim a row that's back is gone.
 */
export type ActivityLogType =
  | "expense_edited"
  | "expense_deleted"
  | "expense_restored"
  | "settlement_edited"
  | "settlement_deleted"
  | "settlement_restored";

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
  /** Set on the automatic "X fordert euch heraus" message a game start posts — renders as a join card. Absent on normal messages. */
  gameInvite?: { tournamentId: string; gameId: DuelGameId };
  /** Set on the automatic message a decided game posts — renders as a result card. Absent on normal messages. */
  gameResult?: ChatGameResult;
  /** Set on the automatic message an online luck round posts when it starts — a join card. */
  luckInvite?: { roundId: string; gameId: OnlineLuckGameId };
  /** Set on the automatic message an online estimate round posts when it starts — a join card. */
  estimateInvite?: { roundId: string };
}

/** What a decided game tells the group chat — see `ChatMessage.gameResult`. */
export interface ChatGameResult {
  gameId: SplitGameId;
  /** Who pays — or, in a game played just for fun, who lost. */
  loserUids: string[];
  /** The one player left standing, when there is exactly one; otherwise `null`. */
  winnerUid: string | null;
  /** The bill or stake the game decided; `null` for a game played just for fun. */
  amount: { description: string; amountMinor: number; currency: string } | null;
  /** As on `ExpenseGame`: 1 = the first round, more = reshuffled. */
  attempt: number;
  /** A server-run duel's page; `null` for a game played in the expense form. */
  tournamentId: string | null;
  /**
   * An online round's page (absent on older cards): a luck round's, or — for
   * the estimate game — the estimate round's. The link target follows from
   * `gameId`, see `gameRoundPath` (lib/games/round-paths.ts).
   */
  roundId?: string | null;
  /** Estimate only: what decided it, for the card — the truth and the payers' guesses with their distances. */
  estimate?: EstimateChatSummary;
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

/** The 1-vs-1 duel split mini-games that can run as a tournament bracket — see [[Split Games]]. */
export type DuelGameId =
  "tictactoe" | "connectfour" | "memory" | "reaction" | "rps" | "nim" | "dots";

/** The luck-based split mini-games — see [[Split Games]]. */
export type LuckGameId =
  "lottery" | "wheel" | "slot" | "scratch" | "balloon" | "duckrace" | "dicecup" | "pegboard";

/**
 * The skill games the whole table plays at once, on one phone — no duel, so
 * no ladder, tournament or online play, and not luck either — see [[Split Games]].
 */
export type TableGameId = "finger";

/**
 * The knowledge games the whole table plays — one question, one answer; on one
 * phone or online — see [[Split Games]]. Not `TableGameId`: that group is
 * documented as having no online play, and an estimate round has it.
 */
export type QuizGameId = "estimate";

/** Every split mini-game: luck, duel, whole-table and quiz games. */
export type SplitGameId = LuckGameId | DuelGameId | TableGameId | QuizGameId;

/** The luck games that can be played online, everyone on their own phone. */
export type OnlineLuckGameId = "scratch";

export type LuckRoundStatus = "running" | "finished" | "cancelled";

/**
 * One online round of a luck game (`groups/{groupId}/luckRounds/{roundId}`),
 * everyone on their own phone — for now the scratch cards: each player
 * scratches their own. Written only by `lib/actions/luck-rounds.ts`, read
 * live by every device. No face is dealt in advance; each card is drawn the
 * moment it's scratched (`lib/games/luck-round.ts`), so there's no secret
 * to keep. Always for a bill: it books the expense when the last card is
 * scratched (`autoBook`), like a self-booking duel.
 */
export interface LuckRound {
  id: string;
  gameId: OnlineLuckGameId;
  status: LuckRoundStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  /** Name snapshot at creation, like a tournament's. A placeholder's card is scratched by the creator. */
  entrants: Record<string, { displayName: string; isPlaceholder: boolean }>;
  /** The cards' order on screen, drawn by the server; the payers are listed in it too. */
  order: string[];
  targetLoserCount: number;
  /** Per scratched card: `true` = "zahlt". Absent while under foil. */
  revealed: Record<string, boolean>;
  /** Who scratched each card — the player, or the creator for a placeholder or "Rest aufdecken". */
  revealedBy: Record<string, string>;
  /** Set once every card is scratched. */
  loserUids: string[] | null;
  /** The bill behind the round, shown on it. */
  stake: { description: string; amountMinor: number; currency: string };
  autoBook: GameExpenseDraft;
  expenseId: string | null;
  /** Why the bill couldn't be booked at the end (e.g. a payer left the group meanwhile). */
  autoBookError: string | null;
}

// ---------------------------------------------------------------------------
// Estimate rounds ("Schätzfragen", gameId "estimate") — see [[Split Games]].
//
// Every comparable number is an INTEGER in milli-units (thousandths of the
// question's unit: 2962 m -> 2 962 000), at most 10^15, so Firestore stores
// it exactly and no float is ever stored or compared (lib/games/estimate-input.ts).
// ---------------------------------------------------------------------------

/** The estimate bank row's server-only secret part lives in estimate-bank/types; re-exported here so clients can name it. */
export type { EstimateSecrets } from "@/lib/games/estimate-bank/types";

export type EstimateMode = "local" | "online";
export type EstimateRoundStatus = "running" | "finished" | "cancelled";
export type EstimateScale = "ratio" | "interval";
export type EstimateTone = "standard" | "fun";
export type EstimateFormat = "quantity" | "year";
export type EstimateCategory =
  | "geography"
  | "nature"
  | "animals"
  | "body"
  | "space"
  | "science"
  | "technology"
  | "history"
  | "culture"
  | "food"
  | "sport"
  | "everyday";

export interface EstimateUnit {
  /** Label, e.g. "Meter", "Einwohner". */
  de: string;
  /** E.g. "metres", "inhabitants". */
  en: string;
  /** Language-neutral, from ESTIMATE_UNIT_SYMBOLS ("m", "km", "°C", "%", ...) or "" for counts and years. */
  symbol: string;
}

/** The part of a bank row a client may see while guessing. Contains no value, tolerance, source, definition or year. */
export interface EstimatePublicQuestion {
  /** Stable bank id, e.g. "est-geo-0042"; opaque (carries no information about the answer). */
  id: string;
  category: EstimateCategory;
  tone: EstimateTone;
  text: { de: string; en: string };
  unit: EstimateUnit;
  scale: EstimateScale;
  format: EstimateFormat;
  /**
   * A guess must lie in [min, max]. NOT a row property: `toPublicQuestion`
   * reads it from the closed ESTIMATE_BOUNDS table by unit class, so it is
   * identical for every row of a class and carries no information about the
   * answer. The server error codes guess-below-min / guess-above-max leak only
   * this class range.
   */
  bounds: { minMilli: number; maxMilli: number };
}

export type EstimateDirection = "high" | "low" | "exact";

/** How far a guess is off — stored exact, never as a float. */
export type EstimateDistance =
  /** hi = max(guess, truth), lo = min(guess, truth), both milli, lo > 0. */
  | { kind: "ratio"; hi: number; lo: number; direction: EstimateDirection }
  /** |guess - truth| in milli. */
  | { kind: "interval"; diffMilli: number; direction: EstimateDirection };

/** The truth's uncertainty band, half-width. interval: absolute (milli of the unit); ratio: permille of the truth. */
export type EstimateTolerance =
  { kind: "interval"; milli: number } | { kind: "ratio"; permille: number };

export interface EstimateSource {
  label: string;
  url: string;
  kind: "primary" | "secondary";
}

/**
 * "`further` is further off than `closer` for EVERY truth in the band" — a
 * fact settled by the question that produced it. Stored as objects: Firestore
 * rejects an array that directly contains an array.
 */
export interface EstimatePrecedes {
  further: string;
  closer: string;
}

export interface EstimateResultRow {
  uid: string;
  /** `null` = no guess (online time-up). */
  guessMilli: number | null;
  /** `null` iff `guessMilli` is `null`. */
  distance: EstimateDistance | null;
  /** 1 = furthest off (nominal order). */
  rank: number;
  /** After THIS stage. */
  fate: "pays" | "safe" | "contested";
  /** Who typed this guess. `null` = the player themself (always, online); local: the device owner for everyone but themself. */
  enteredBy: string | null;
  /** Online only: `guess.at - stage.openedAt` in ms (`null` = local or no guess). Shown in the ranking so "exact after 4 s" is visible to the table. */
  answeredAfterMs: number | null;
}

/** Everything the truth adds once a stage is revealed. Absent while guessing. */
export interface EstimateReveal {
  /** ISO. */
  revealedAt: string;
  reason: "all-in" | "time-up" | "local";
  truthMilli: number;
  tolerance: EstimateTolerance | null;
  /** The year the value is valid for. */
  asOf: number;
  /** The first primary source: shown with the truth. */
  source: { label: string; url: string };
  sources: EstimateSource[];
  /** Editorial English: what exactly was measured. */
  definition: string;
  note: string | null;
  /** Ranked, furthest first. */
  results: EstimateResultRow[];
  /** Certain payers of this stage, FURTHEST FIRST (the order the bill is split in). */
  payers: string[];
  /** Certain safe of this stage, ranked order. */
  safe: string[];
  /** Ranked order. */
  contested: string[];
  /** Payers still to find among `contested` (0 if none contested). */
  slotsLeft: number;
  /** Strict facts among `contested` that the next stage must respect. `[]` when nothing is contested. */
  precedes: EstimatePrecedes[];
  /**
   * True iff two contested players with guesses are tied by the band although
   * their distances differ (not an exact tie). Drives the tolerance note;
   * computed server-side so no client needs the classifier.
   */
  bandTie: boolean;
  next: "decided" | "stechen" | "shuffle";
  /** Iff `next === "shuffle"`: the contested players in lot order. */
  shuffled: string[] | null;
  /** Iff `next === "shuffle"`: the lot's picks = `lotPicks(shuffled, precedes, slotsLeft)`, in pick order. */
  lotPayers: string[] | null;
}

export interface EstimateStage {
  /** 0 = the question, 1..3 = Stechfrage. */
  index: number;
  kind: "main" | "stechen";
  question: EstimatePublicQuestion;
  /** Who guesses in this stage (stage 0: every entrant). */
  contenders: string[];
  /** Payers still to find among the contenders. */
  slots: number;
  openedAt: string;
  /**
   * Online only: `openedAt + answerWindowMs`; moved to
   * `lastCallAt + ESTIMATE_LAST_CALL_MS` when the last call starts. `null` for
   * local rounds.
   */
  closesAt: string | null;
  /** Online only: set once, by the first "Jetzt auswerten" that finds players without a guess. */
  lastCallAt: string | null;
  /** Online: uids with a locked guess — NEVER the values. Local: `[]` until reveal. */
  submitted: string[];
  status: "guessing" | "revealed";
  /** Non-null iff `status === "revealed"`. */
  reveal: EstimateReveal | null;
}

/**
 * One round of the estimate game (`groups/{groupId}/estimateRounds/{roundId}`)
 * — the PUBLIC document, readable by every member: it holds the question and,
 * per stage, the truth and the guesses only once that stage is revealed. The
 * still-hidden guesses and the full bank row live in
 * `estimateRounds/{roundId}/secrets/{stage}` (server only). Written only by
 * `lib/actions/estimate-rounds.ts`.
 */
export interface EstimateRound {
  /** Doc id (clients add it: `{ id: snapshot.id, ...data }`). */
  id: string;
  /** ESTIMATE_RULES_VERSION at creation. `replayEstimateAudit` dispatches on it, so a later rules fix never flips an old verdict. */
  rulesVersion: number;
  mode: EstimateMode;
  status: EstimateRoundStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  /** Name snapshot at creation (like `LuckRound.entrants`). Online: accounts only. Local: placeholders allowed — everyone is at the table. */
  entrants: Record<string, { displayName: string; isPlaceholder: boolean }>;
  /** Display order. Online: `secureShuffle(pool)`. Local: the pool order the table sat in (hand-over order). */
  order: string[];
  /** k, `1 <= k <= entrants - 1`. */
  targetLoserCount: number;
  includeFun: boolean;
  /** Online: one of ESTIMATE_ANSWER_WINDOWS_MS; local: `null`. */
  answerWindowMs: number | null;
  /** 1..4 (the main question and at most 3 Stechfragen). */
  stages: EstimateStage[];
  /** Payers, FURTHEST FIRST within a stage, stage by stage, the lot's picks last — the order the bill is split in. `null` until decided. */
  loserUids: string[] | null;
  resolvedBy: "distance" | "stechen" | "shuffle" | null;
  /** Online: the bill the round books itself. Local: `null` (the expense form holds the bill). */
  stake: { description: string; amountMinor: number; currency: string } | null;
  autoBook: GameExpenseDraft | null;
  /** Online: id of the auto-booked expense. Local: id of the expense that claimed this round, else `null`. */
  expenseId: string | null;
  /** E.g. "member-left". */
  autoBookError: string | null;
}

/** `groups/{groupId}/estimateState/seen` — server only. A missing document reads as `{ seenIds: [], resets: 0, recent: {}, updatedAt: <now> }`. */
export interface EstimateSeen {
  /** Question ids this group has been shown since their pool last reset (chronological). Ids no longer in the bank are pruned on every draw. */
  seenIds: string[];
  /** How many times a pool was exhausted and restarted (maintainers' curiosity; nothing reads it). */
  resets: number;
  /**
   * Round creations per member, ISO timestamps newest last, trimmed to the
   * last ESTIMATE_CREATE_CAP.max. An ANTI-SPAM cap only (every online round
   * posts a chat card and pushes the group); it does not pretend to stop
   * anyone reading the (public) bank.
   */
  recent: Record<string, string[]>;
  updatedAt: string;
}

/** The compact, re-verifiable record of a finished estimate round. Holds exactly the inputs of `classifyEstimate` and the booked money. */
export interface EstimateAudit {
  /** ESTIMATE_RULES_VERSION the round was played under; `replayEstimateAudit` dispatches on it. */
  rulesVersion: number;
  roundId: string;
  mode: EstimateMode;
  /** Who held the phone. For `mode: "local"` this person typed every guess not typed by its owner. */
  createdBy: string;
  finishedAt: string;
  resolvedBy: "distance" | "stechen" | "shuffle";
  /**
   * uid -> name snapshot (includes `createdBy`). A member may leave or a
   * placeholder be claimed later and `move-member.ts` only rewrites
   * paidBy/splits, so the audit keeps the OLD uid and
   * `compareEstimateAuditToExpense` tolerates a claimed placeholder.
   */
  names: Record<string, { name: string; placeholder: boolean }>;
  /** What the booking was, in booking order (= `round.loserUids`, furthest first). */
  booked: { amountMinor: number; currency: string; loserUids: string[] };
  stages: EstimateAuditStage[];
  /** The order the lot produced for the last stage's contested players (`null` unless `resolvedBy === "shuffle"`). */
  shuffled: string[] | null;
}

export interface EstimateAuditStage {
  kind: "main" | "stechen";
  questionId: string;
  text: { de: string; en: string };
  unit: EstimateUnit;
  scale: EstimateScale;
  format: EstimateFormat;
  truthMilli: number;
  tolerance: EstimateTolerance | null;
  asOf: number;
  sourceLabel: string;
  /** The primary source's URL and the definition decide whether a truth was right, so a dispute needs them on the expense. */
  sourceUrl: string;
  definition: string;
  /** Why the stage closed. A `null` guess with reason "time-up" is a timeout, not a missing input. */
  reason: "all-in" | "time-up" | "local";
  /** contender -> guess (`null` = none). The keys ARE the contenders. */
  guessesMilli: Record<string, number | null>;
  /** Only the seats NOT typed by their own owner (uid -> who typed it). Empty online. */
  enteredBy: Record<string, string>;
  /** k for this stage. */
  slots: number;
}

/** What a decided estimate round tells the group chat — see `ChatGameResult.estimate`. */
export interface EstimateChatSummary {
  resolvedBy: "distance" | "stechen" | "shuffle";
  /** One line per stage that produced at least one payer. */
  lines: EstimateChatLine[];
}

export interface EstimateChatLine {
  text: { de: string; en: string };
  unit: EstimateUnit;
  scale: EstimateScale;
  format: EstimateFormat;
  truthMilli: number;
  /** `name` is a snapshot, so the card never needs a name lookup (a claimed placeholder or a departed member would show "?"). */
  payers: {
    uid: string;
    name: string;
    guessMilli: number | null;
    distance: EstimateDistance | null;
    byLot: boolean;
  }[];
}

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
  /**
   * "local": every match is played by its two players sharing one phone (the
   * original claim → play → report flow). "online": each player plays on
   * their own phone, move by move, through a `liveMatches` doc — except a
   * match with a placeholder member in it, which has no phone of its own and
   * so still plays locally (`isOnlineMatch`, lib/games/online-match.ts).
   * Absent on tournaments created before online play existed — read it as
   * "local".
   */
  playMode?: TournamentPlayMode;
  /**
   * The expense to book, server-side, the moment the bracket finishes —
   * everything but the split, which the result decides. Absent/null when the
   * result is applied by hand instead (a tournament started while *editing*
   * an expense, or created before auto-booking existed).
   */
  autoBook?: GameExpenseDraft | null;
  /** Set once `autoBook` has actually been booked — the id of the new expense. */
  expenseId?: string | null;
  /** Why `autoBook` couldn't be booked at finish (e.g. a loser left the group meanwhile); absent on success. */
  autoBookError?: string | null;
  /**
   * Set once a player asked for a rematch ("Revanche"): the new game's id, so
   * the other player's "Revanche" joins it instead of starting another.
   */
  rematchId?: string | null;
}

export type TournamentPlayMode = "local" | "online";

/** An expense minus its split — what a game decides. Validated at tournament start, booked at finish. */
export interface GameExpenseDraft {
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: CategoryId | null;
  emoji: string | null;
  paidBy: Record<string, number>;
  /**
   * A game played "for a stake" with no bill behind it: nobody paid up front,
   * so the winner becomes the payer once the bracket is decided and the losers
   * split the amount. `paidBy` is empty until then.
   */
  payerIsWinner?: boolean;
}

/**
 * Per-game move-by-move state of one online match. Firestore can't store
 * nested arrays, so both grid games keep a flat move list (replayed through
 * the pure rule modules) instead of a board.
 */
export type LiveMatchState =
  | { gameId: "tictactoe"; moves: number[] }
  | { gameId: "connectfour"; columns: number[] }
  | {
      gameId: "memory";
      /** Per card: the face once claimed, `null` while still face down. */
      claimedFaces: (string | null)[];
      /** Per card: which player claimed it, `-1` while unclaimed. */
      claimedBy: (0 | 1 | -1)[];
      /** The (at most two) currently face-up, unclaimed cards — a mismatch stays shown until the next flip. */
      open: { index: number; face: string }[];
      scores: [number, number];
      turn: 0 | 1;
    }
  | {
      gameId: "reaction";
      ready: [boolean, boolean];
      /** Drawn by the server once both are ready; each phone waits this long after seeing it, then shows "Los!". */
      signalDelayMs: number | null;
      /** Each phone's own measured reaction, or a false start; `null` until reported. */
      results: [ReactionReport | null, ReactionReport | null];
    }
  | {
      gameId: "rps";
      /** Every round both players have revealed, in order — a drawn round stays in the list and is simply played again. */
      rounds: RpsRound[];
      /** Who has locked in a hand for the current round. The hand itself stays in `liveSecrets` until both are in. */
      locked: [boolean, boolean];
    }
  /**
   * Flat list of actions, each a small integer — a take is `row * 8 + count`
   * (+32 when the fuse made it for a slow player), a joker is 100 — replayed
   * through `lib/games/nim.ts` (see `encodeNimMove`, `encodeNimSkip`).
   */
  | { gameId: "nim"; moves: number[] }
  /** Flat list of drawn line numbers in order (see `lib/games/dots-and-boxes.ts`); extra turns come from replaying it. */
  | { gameId: "dots"; lines: number[] };

export type ReactionReport = { kind: "time"; ms: number } | { kind: "falseStart" };

/**
 * One online match's live board (`groups/{groupId}/tournaments/{tournamentId}/liveMatches/{matchId}`,
 * doc id == the bracket match id). Written only by `playOnlineMove`; both
 * players (and any spectator) render it via `onSnapshot`. The bracket doc
 * only learns the final winner, in the same transaction as the deciding move.
 */
export interface LiveMatch {
  id: string;
  gameId: DuelGameId;
  /** `players[0]` moves first in the current attempt; swapped on every draw replay, like the ladder. */
  players: [string, string];
  /** 0 on the first try, +1 per draw replay — Tic-Tac-Toe switches to sudden death from 2. */
  attempt: number;
  state: LiveMatchState;
  /** Bumped on every accepted move — lets a client tell a fresh snapshot from a stale one. */
  version: number;
  /** Set on a draw until the next move: "the last attempt was a draw", so both phones can say so. */
  lastDrawAt: string | null;
  winnerUid: string | null;
  /** How the match was decided, for the result card ("Fehlstart", "132 ms" …). */
  finish: { reason: "win" | "falseStart" | "forfeit"; at: string } | null;
  updatedAt: string;
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
