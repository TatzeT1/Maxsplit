"use server";

import { getSession } from "@/lib/auth/session";
import { gameResultMessage } from "@/lib/chat/game-result";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/format/money";
import { buildEstimateAudit, buildEstimateChatSummary } from "@/lib/games/estimate-audit";
// The ONLY server import of the question bank (ESLint, eslint.config.mjs): the rows are
// plaintext truths, kept out of client bundles and client-readable documents.
import { ESTIMATE_BANK } from "@/lib/games/estimate-bank";
import { drawEstimateQuestion, hasEligibleStechfrage } from "@/lib/games/estimate-bank/draw";
import { toPublicQuestion } from "@/lib/games/estimate-bank/public";
import type { EstimateQuestion, EstimateSecrets } from "@/lib/games/estimate-bank/types";
import {
  ESTIMATE_ANSWER_WINDOWS_MS,
  ESTIMATE_CREATE_CAP,
  ESTIMATE_LAST_CALL_MS,
  ESTIMATE_MAX_PLAYERS,
  ESTIMATE_RULES_VERSION,
  absentContenders,
  canGuess,
  checkEstimateGuess,
  guessDeadlineMs,
  isValidEstimateCount,
  nextCloseAction,
  type EstimateGuessProblem,
} from "@/lib/games/estimate-input";
import { resolveEstimateStage } from "@/lib/games/estimate-rules";
import { secureShuffle } from "@/lib/games/random";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { isGroupManager } from "@/lib/groups/permissions";
import { getServerT } from "@/lib/i18n/server";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import { buildGameExpense, validateGameExpenseDraft } from "@/lib/money/game-expense";
import {
  estimateChallengePushes,
  estimateLastCallPushes,
  estimateNotBookedPushes,
  estimateStechenPushes,
  expensePushes,
} from "@/lib/push/messages";
import { notifyAfterResponse } from "@/lib/push/notify";
import type { PendingPush } from "@/lib/push/types";
import type {
  ChatMessage,
  EstimateReveal,
  EstimateRound,
  EstimateSeen,
  EstimateStage,
  Expense,
  GameExpenseDraft,
  Group,
} from "@/lib/types";
import type { ActionResult } from "./groups";

// Estimate rounds, "Schätzfragen" (ADR-007): one question, one numeric answer,
// the players furthest off pay. One phone or online. The rules are the pure
// modules lib/games/estimate-*.ts; this layer runs them inside transactions.
//
// Where the secrets live. The truth and the still-hidden guesses are in
// `estimateRounds/{r}/secrets/{stage}` (no client can read or write it); the
// public round document (every member watches it live) only gets them in the
// same transaction that reveals a stage. No action returns a secret before
// that: the error codes carry no value, and `submitLocalEstimateGuesses`
// returns the round only because its stage is revealed in that very call.
//
// Every transaction reads first (round, secrets, group, seen — always all
// four, because a stage that finishes may draw a Stechfrage and the Admin SDK
// throws on a read after the first write), computes in memory, writes last.

type RoundDoc = Omit<EstimateRound, "id">;
type GroupDoc = Omit<Group, "id">;
type ServerT = Awaited<ReturnType<typeof getServerT>>;
type DocRef = FirebaseFirestore.DocumentReference;
type Guesses = EstimateSecrets["guesses"];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** What a failed check answers; `ok: false` results are returned as the action's own. */
type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Own keys only: `uid in members` / `members[uid]` follow the prototype chain ("constructor", "__proto__"). */
function hasMember(group: Pick<Group, "members">, uid: string): boolean {
  return Object.hasOwn(group.members, uid);
}

/** A copy without `undefined` values (the Admin SDK rejects them) — for bank rows, whose optional fields may be absent. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type MembershipResult =
  { error: "not-found" | "forbidden" } | { group: GroupDoc; groupRef: DocRef };

async function requireGroupMembership(groupId: string, uid: string): Promise<MembershipResult> {
  const groupSnap = await adminDb.collection("groups").doc(groupId).get();
  if (!groupSnap.exists) return { error: "not-found" };
  const group = groupSnap.data() as GroupDoc;
  if (!group.memberUids.includes(uid)) return { error: "forbidden" };
  return { group, groupRef: groupSnap.ref };
}

const seenRefOf = (groupRef: DocRef) => groupRef.collection("estimateState").doc("seen");
const secretsRefOf = (roundRef: DocRef, stageIndex: number) =>
  roundRef.collection("secrets").doc(String(stageIndex));

/** A missing document is the empty one (B.6); every reader treats it so. */
function toSeen(snap: FirebaseFirestore.DocumentSnapshot, now: string): EstimateSeen {
  const data = snap.exists ? (snap.data() as Partial<EstimateSeen>) : {};
  return {
    seenIds: Array.isArray(data.seenIds) ? data.seenIds : [],
    resets: typeof data.resets === "number" ? data.resets : 0,
    recent: isRecord(data.recent) ? (data.recent as Record<string, string[]>) : {},
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : now,
  };
}

/** This member's round creations inside the anti-spam window. */
function recentCreations(seen: EstimateSeen, uid: string, nowMs: number): string[] {
  const list = Object.hasOwn(seen.recent, uid) ? seen.recent[uid] : [];
  return (Array.isArray(list) ? list : []).filter(
    (iso) => nowMs - Date.parse(iso) < ESTIMATE_CREATE_CAP.windowMs,
  );
}

function creatorEntry(group: GroupDoc, uid: string): { name: string; placeholder: boolean } {
  const member = hasMember(group, uid) ? group.members[uid] : undefined;
  return { name: member?.displayName ?? "?", placeholder: member?.isPlaceholder === true };
}

function nameOfIn(group: GroupDoc, round: Pick<RoundDoc, "entrants">) {
  return (uid: string): string => {
    if (hasMember(group, uid)) return group.members[uid].displayName;
    return Object.hasOwn(round.entrants, uid) ? round.entrants[uid].displayName : "?";
  };
}

function isoPlus(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/** The public stage a question opens: no value, no tolerance, no source — `toPublicQuestion` copies field by field. */
function openStage(input: {
  index: number;
  kind: EstimateStage["kind"];
  question: EstimateQuestion;
  contenders: string[];
  slots: number;
  now: string;
  /** Online: how long the stage runs; `null` for a local round. */
  windowMs: number | null;
}): EstimateStage {
  return {
    index: input.index,
    kind: input.kind,
    question: toPublicQuestion(input.question),
    contenders: input.contenders,
    slots: input.slots,
    openedAt: input.now,
    closesAt: input.windowMs === null ? null : isoPlus(input.now, input.windowMs),
    lastCallAt: null,
    submitted: [],
    status: "guessing",
    reveal: null,
  };
}

function secretsFor(index: number, question: EstimateQuestion, now: string): EstimateSecrets {
  return { stageIndex: index, question: plain(question), guesses: {}, createdAt: now };
}

const GUESS_ERRORS: Record<EstimateGuessProblem, string> = {
  invalid: "guess-invalid",
  zero: "guess-zero",
  "not-whole": "guess-not-whole",
  "below-min": "guess-below-min",
  "above-max": "guess-above-max",
};

// ---------------------------------------------------------------------------
// Validation shared by the two create actions
// ---------------------------------------------------------------------------

/**
 * The pool, or why it is invalid. Every uid is a plain id AND an own key of
 * `group.members` (never `in`). `accountsOnly`: an online round needs phones —
 * a placeholder cannot guess, and whoever guessed for it could steer the result.
 */
function checkPool(
  group: GroupDoc,
  rawPool: unknown,
  accountsOnly: boolean,
): { ok: true; poolUids: string[] } | Fail {
  if (!Array.isArray(rawPool) || rawPool.length > ESTIMATE_MAX_PLAYERS * 4) {
    return fail("invalid-pool");
  }
  const poolUids = [...new Set(rawPool)];
  if (poolUids.length < 2 || poolUids.length > ESTIMATE_MAX_PLAYERS) return fail("invalid-pool");
  for (const uid of poolUids) {
    if (!isId(uid) || !hasMember(group, uid)) return fail("invalid-pool");
    if (accountsOnly && (!group.memberUids.includes(uid) || group.members[uid].isPlaceholder)) {
      return fail("invalid-pool");
    }
  }
  return { ok: true, poolUids: poolUids as string[] };
}

/** The auto-book draft as stored: only the fields of a `GameExpenseDraft`, the description trimmed — or why it is invalid. */
function checkDraft(group: GroupDoc, raw: unknown): { ok: true; draft: GameExpenseDraft } | Fail {
  if (!isRecord(raw)) return fail("invalid-payer");
  if (raw.payerIsWinner) return fail("invalid-payer");
  if (!isRecord(raw.paidBy)) return fail("invalid-payer");
  const candidate = raw as unknown as GameExpenseDraft;
  const error = validateGameExpenseDraft(candidate, group.members);
  if (error) return fail(error);
  if (candidate.currency !== group.currency) return fail("invalid-currency");
  return {
    ok: true,
    draft: {
      description: candidate.description.trim(),
      amountMinor: candidate.amountMinor,
      currency: candidate.currency,
      date: candidate.date,
      category: candidate.category,
      emoji: candidate.emoji,
      paidBy: { ...candidate.paidBy },
    },
  };
}

// ---------------------------------------------------------------------------
// Finishing a stage
// ---------------------------------------------------------------------------

/** What a finished stage writes, computed in memory (no reads), applied by `applyFinish` and `afterFinish`. */
interface FinishPlan {
  /** The whole round as it is after this stage. */
  round: RoundDoc;
  /** Secrets of the Stechfrage that opened, if any. */
  nextSecrets: EstimateSecrets | null;
  /** The updated seen-set, iff a Stechfrage was drawn. */
  seen: EstimateSeen | null;
  expense: { ref: DocRef; data: Omit<Expense, "id"> } | null;
  message: Omit<ChatMessage, "id"> | null;
  clearPointer: boolean;
  /** Pushes to send after the commit. */
  after: {
    stechen: { stageIndex: number; uids: string[] } | null;
    notBooked: { names: string; description: string } | null;
    /** Uids who locked at least one guess: they watched the verdict, so no expense push for them. */
    guessed: string[];
  };
}

const listFormatter = new Intl.ListFormat("de-DE", { type: "conjunction" });

/**
 * Resolves the last (guessing) stage with `secrets.guesses` and returns what to
 * write: the revealed stage and, if the contest goes on, the Stechfrage (drawn
 * here, from the seen-set read earlier); or, when decided, the finished round
 * and — online, in the same transaction — the booked expense, the chat result
 * card and the cleared pointer. Performs NO reads: the caller has read round,
 * secrets, group and seen already.
 *
 * Exactly once: it runs only on a stage that is still "guessing", and the
 * transaction flips it to "revealed"; a racing second finisher re-reads a
 * revealed stage and answers idempotently.
 */
function finishStage(input: {
  groupRef: DocRef;
  roundId: string;
  round: RoundDoc;
  stage: EstimateStage;
  secrets: EstimateSecrets;
  seen: EstimateSeen;
  group: GroupDoc;
  t: ServerT;
  now: string;
  reason: EstimateReveal["reason"];
}): FinishPlan {
  const { groupRef, roundId, round, stage, secrets, seen, group, t, now, reason } = input;
  const usedIds = round.stages.map((s) => s.question.id);
  // Asked BEFORE resolving: an exhausted bank turns a contested stage into a lot
  // instead of failing the transaction on every retry.
  const stechenAvailable = hasEligibleStechfrage({
    bank: ESTIMATE_BANK,
    includeFun: round.includeFun,
    exclude: usedIds,
  });
  const res = resolveEstimateStage({
    round,
    stage,
    question: secrets.question,
    guesses: secrets.guesses,
    now,
    reason,
    stechenAvailable,
    shuffle: secureShuffle,
  });

  const revealedStage: EstimateStage = {
    ...stage,
    submitted: stage.contenders.filter((uid) => Object.hasOwn(secrets.guesses, uid)),
    status: "revealed",
    reveal: res.reveal,
  };
  const stages = [...round.stages.slice(0, stage.index), revealedStage];
  const guessed = [
    ...new Set(
      stages.flatMap((s) =>
        (s.reveal?.results ?? []).flatMap((row) => (row.guessMilli === null ? [] : [row.uid])),
      ),
    ),
  ];
  const noAfter = { stechen: null, notBooked: null, guessed } as const;

  if (res.stechen) {
    // The contest goes on: a fresh question for the contested players only.
    const draw = drawEstimateQuestion({
      bank: ESTIMATE_BANK,
      seen: seen.seenIds,
      includeFun: round.includeFun,
      exclude: usedIds,
      preferNoTolerance: true,
      shuffle: secureShuffle,
    });
    const next = openStage({
      index: stage.index + 1,
      kind: "stechen",
      question: draw.question,
      contenders: res.stechen.contenders,
      slots: res.stechen.slots,
      now,
      windowMs: round.answerWindowMs,
    });
    return {
      round: { ...round, stages: [...stages, next], updatedAt: now },
      nextSecrets: secretsFor(next.index, draw.question, now),
      seen: {
        seenIds: draw.seen,
        resets: seen.resets + (draw.reset ? 1 : 0),
        recent: seen.recent,
        updatedAt: now,
      },
      expense: null,
      message: null,
      clearPointer: false,
      after: {
        ...noAfter,
        stechen: round.mode === "online" ? { stageIndex: next.index, uids: next.contenders } : null,
      },
    };
  }

  const decided = res.decided;
  if (!decided) throw new Error("a stage that is not a Stechfrage must be decided");
  const finished: RoundDoc = {
    ...round,
    stages,
    status: "finished",
    finishedAt: now,
    loserUids: decided.loserUids,
    resolvedBy: decided.resolvedBy,
    updatedAt: now,
  };

  // A one-phone round books nothing itself: the expense form holds the bill, and
  // a later `addExpense` may claim the round (E.9). No pointer, no chat card.
  if (round.mode !== "online" || !round.autoBook || !round.stake) {
    return {
      round: finished,
      nextSecrets: null,
      seen: null,
      expense: null,
      message: null,
      clearPointer: false,
      after: noAfter,
    };
  }

  let expense: FinishPlan["expense"] = null;
  let autoBookError: string | null = null;
  if (round.expenseId !== null) {
    // Already booked (can't happen for a stage still guessing): never book twice.
    autoBookError = round.autoBookError;
  } else {
    const draftError = validateGameExpenseDraft(round.autoBook, group.members);
    if (draftError || !decided.loserUids.every((uid) => hasMember(group, uid))) {
      autoBookError = draftError ?? "member-left";
    } else {
      const ref = groupRef.collection("expenses").doc();
      const audit = buildEstimateAudit(
        { id: roundId, ...finished },
        { amountMinor: round.stake.amountMinor, currency: round.stake.currency },
        creatorEntry(group, round.createdBy),
      );
      expense = {
        ref,
        data: buildGameExpense({
          draft: round.autoBook,
          loserUids: decided.loserUids,
          game: { gameId: "estimate", playerUids: round.order, attempt: 1, estimate: audit },
          createdBy: round.createdBy,
          now,
        }),
      };
    }
  }

  const finalRound: RoundDoc = {
    ...finished,
    expenseId: expense ? expense.ref.id : finished.expenseId,
    autoBookError,
  };
  const nameOf = nameOfIn(group, round);
  return {
    round: finalRound,
    nextSecrets: null,
    seen: null,
    expense,
    message: gameResultMessage({
      t,
      senderUid: round.createdBy,
      nameOf,
      now,
      result: {
        gameId: "estimate",
        loserUids: decided.loserUids,
        winnerUid: null,
        amount: autoBookError ? null : round.stake,
        attempt: 1,
        tournamentId: null,
        roundId,
        estimate: buildEstimateChatSummary({ id: roundId, ...finalRound }),
      },
    }),
    clearPointer: group.activeEstimateRound?.id === roundId,
    after: {
      stechen: null,
      notBooked:
        autoBookError && !expense
          ? {
              names: listFormatter.format(decided.loserUids.map(nameOf)),
              description: round.stake.description,
            }
          : null,
      guessed,
    },
  };
}

/** The writes of a plan, in the transaction (reads are all done). */
function applyFinish(
  tx: FirebaseFirestore.Transaction,
  ctx: { groupRef: DocRef; roundRef: DocRef },
  plan: FinishPlan,
): void {
  tx.set(ctx.roundRef, plan.round);
  if (plan.nextSecrets) {
    tx.set(secretsRefOf(ctx.roundRef, plan.nextSecrets.stageIndex), plan.nextSecrets);
  }
  if (plan.seen) tx.set(seenRefOf(ctx.groupRef), plan.seen);
  if (plan.expense) tx.set(plan.expense.ref, plan.expense.data);
  if (plan.message) tx.set(ctx.groupRef.collection("messages").doc(), plan.message);
  if (plan.clearPointer) tx.update(ctx.groupRef, { activeEstimateRound: null });
}

/** What the caller needs after the commit: the plan's pushes and the balance refresh. */
interface AfterFinish {
  group: GroupDoc;
  plan: FinishPlan;
}

/** Outside the transaction, like `afterFinish` in luck-rounds.ts: balances, then the pushes. */
async function afterFinish(
  groupId: string,
  groupRef: DocRef,
  roundId: string,
  done: AfterFinish,
): Promise<void> {
  const { group, plan } = done;
  const pushes: PendingPush[] = [];
  if (plan.expense) {
    await recomputeGroupBalances(groupRef);
    pushes.push(
      ...expensePushes({
        groupId,
        group,
        expenseId: plan.expense.ref.id,
        expense: plan.expense.data,
        origin: "game",
        actorUid: null,
        // The players who answered watched the verdict; an entrant who never answered still hears it.
        skip: plan.after.guessed,
      }),
    );
  }
  if (plan.after.stechen) {
    pushes.push(...estimateStechenPushes({ groupId, group, roundId, ...plan.after.stechen }));
  }
  if (plan.after.notBooked) {
    pushes.push(
      ...estimateNotBookedPushes({
        groupId,
        group,
        roundId,
        actorUid: plan.round.createdBy,
        ...plan.after.notBooked,
      }),
    );
  }
  if (pushes.length > 0) notifyAfterResponse(pushes);
}

// ---------------------------------------------------------------------------
// Online: create, guess, close, cancel
// ---------------------------------------------------------------------------

/**
 * Starts an online round for a new bill: draws the question, posts the invite
 * card (which states the deadline and what it costs not to answer), points the
 * group at the round and asks the pool to play. One online round per group; a
 * stale pointer (missing or finished round) is recovered, not wedged.
 */
export async function createEstimateRound(input: {
  groupId: string;
  poolUids: string[];
  targetLoserCount: number;
  includeFun: boolean;
  answerWindowMs: number;
  autoBook: GameExpenseDraft;
}): Promise<ActionResult<{ roundId: string }>> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  if (!isRecord(input) || !isId(input.groupId)) return fail("not-found");

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return fail(membership.error);
  const { group, groupRef } = membership;

  if (typeof input.includeFun !== "boolean") return fail("invalid-input");
  if (!(ESTIMATE_ANSWER_WINDOWS_MS as readonly unknown[]).includes(input.answerWindowMs)) {
    return fail("invalid-window");
  }
  const pool = checkPool(group, input.poolUids, true);
  if (!pool.ok) return pool;
  const { poolUids } = pool;
  if (!isValidEstimateCount(input.targetLoserCount, poolUids.length)) return fail("invalid-count");
  const drafted = checkDraft(group, input.autoBook);
  if (!drafted.ok) return drafted;
  const { draft } = drafted;
  // Checked before any transaction: a transaction must never throw "pool empty".
  if (!hasEligibleStechfrage({ bank: ESTIMATE_BANK, includeFun: input.includeFun, exclude: [] })) {
    return fail("bank-empty");
  }

  const t = await getServerT();
  const roundRef = groupRef.collection("estimateRounds").doc();
  const seenRef = seenRefOf(groupRef);
  const uid = session.uid;
  const minutes = input.answerWindowMs / 60_000;

  type Started = { ok: true; group: GroupDoc; stake: NonNullable<RoundDoc["stake"]> } | Fail;
  const started = await adminDb.runTransaction<Started>(async (tx) => {
    // Read phase.
    const [groupSnap, seenSnap] = await Promise.all([tx.get(groupRef), tx.get(seenRef)]);
    if (!groupSnap.exists) return fail("not-found");
    const fresh = groupSnap.data() as GroupDoc;
    const pointer = fresh.activeEstimateRound;
    const active =
      pointer && isId(pointer.id)
        ? await tx.get(groupRef.collection("estimateRounds").doc(pointer.id))
        : null;
    if (active?.exists && (active.data() as RoundDoc).status === "running") {
      return fail("round-running");
    }
    // Anything else the pointer holds is stale: ignored here, replaced below.

    // A member may have left since the checks above.
    const stillPool = checkPool(fresh, poolUids, true);
    if (!stillPool.ok) return stillPool;
    if (!fresh.memberUids.includes(uid)) return fail("forbidden");

    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    const seen = toSeen(seenSnap, now);
    const recent = recentCreations(seen, uid, nowMs);
    if (recent.length >= ESTIMATE_CREATE_CAP.max) return fail("rate-limited");

    const draw = drawEstimateQuestion({
      bank: ESTIMATE_BANK,
      seen: seen.seenIds,
      includeFun: input.includeFun,
      exclude: [],
      shuffle: secureShuffle,
    });
    const order = secureShuffle(poolUids);
    const stake = {
      description: draft.description,
      amountMinor: draft.amountMinor,
      currency: draft.currency,
    };
    const round: RoundDoc = {
      rulesVersion: ESTIMATE_RULES_VERSION,
      mode: "online",
      status: "running",
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      entrants: Object.fromEntries(
        poolUids.map((member) => [
          member,
          { displayName: fresh.members[member].displayName, isPlaceholder: false },
        ]),
      ),
      order,
      targetLoserCount: input.targetLoserCount,
      includeFun: input.includeFun,
      answerWindowMs: input.answerWindowMs,
      stages: [
        openStage({
          index: 0,
          kind: "main",
          question: draw.question,
          contenders: order,
          slots: input.targetLoserCount,
          now,
          windowMs: input.answerWindowMs,
        }),
      ],
      loserUids: null,
      resolvedBy: null,
      stake,
      autoBook: draft,
      expenseId: null,
      autoBookError: null,
    };
    const invite: Omit<ChatMessage, "id"> = {
      senderUid: uid,
      text: t("chat.estimateInviteText", {
        name: fresh.members[uid]?.displayName ?? "",
        game: t(SPLIT_GAME_META.estimate.nameKey),
        stake: `${stake.description} · ${formatMoney(stake.amountMinor, stake.currency)}`,
        minutes,
      }),
      createdAt: now,
      estimateInvite: { roundId: roundRef.id },
    };

    // Write phase.
    tx.set(roundRef, round);
    tx.set(secretsRefOf(roundRef, 0), secretsFor(0, draw.question, now));
    tx.set(seenRef, {
      seenIds: draw.seen,
      resets: seen.resets + (draw.reset ? 1 : 0),
      recent: { ...seen.recent, [uid]: [...recent, now].slice(-ESTIMATE_CREATE_CAP.max) },
      updatedAt: now,
    } satisfies EstimateSeen);
    tx.update(groupRef, { activeEstimateRound: { id: roundRef.id } });
    tx.set(groupRef.collection("messages").doc(), invite);
    return { ok: true, group: fresh, stake };
  });
  if (!started.ok) return started;

  notifyAfterResponse(
    estimateChallengePushes({
      groupId: input.groupId,
      group: started.group,
      roundId: roundRef.id,
      stake: started.stake,
      poolUids,
      actorUid: uid,
      minutes,
    }),
  );
  return { ok: true, data: { roundId: roundRef.id } };
}

/**
 * Locks the caller's own guess (nobody guesses for someone else online). It is
 * stored in the secrets document only; the public round just learns that this
 * player has answered. The guess that completes the stage reveals it, in the
 * same transaction — and books the bill if that decides the round.
 */
export async function submitEstimateGuess(input: {
  groupId: string;
  roundId: string;
  stageIndex: number;
  guessMilli: number;
}): Promise<ActionResult<{ stageClosed: boolean }>> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  if (!isRecord(input) || !isId(input.groupId) || !isId(input.roundId)) return fail("not-found");
  if (!Number.isSafeInteger(input.stageIndex) || input.stageIndex < 0) return fail("invalid-input");

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return fail(membership.error);
  const { groupRef } = membership;
  const roundRef = groupRef.collection("estimateRounds").doc(input.roundId);
  const secretsRef = secretsRefOf(roundRef, input.stageIndex);
  const t = await getServerT();
  const uid = session.uid;

  type Submitted = { ok: true; stageClosed: boolean; done: AfterFinish | null } | Fail;
  const result = await adminDb.runTransaction<Submitted>(async (tx) => {
    const [roundSnap, secretsSnap, groupSnap, seenSnap] = await Promise.all([
      tx.get(roundRef),
      tx.get(secretsRef),
      tx.get(groupRef),
      tx.get(seenRefOf(groupRef)),
    ]);
    if (!roundSnap.exists || !groupSnap.exists) return fail("not-found");
    const round = roundSnap.data() as RoundDoc;
    const group = groupSnap.data() as GroupDoc;
    if (round.mode !== "online") return fail("wrong-mode");
    if (round.status !== "running") return fail("round-not-running");
    const stage = round.stages[round.stages.length - 1];
    if (input.stageIndex !== stage.index) return fail("stale-stage");
    if (stage.status !== "guessing") return fail("stage-closed");
    if (!secretsSnap.exists) return fail("not-found");
    if (!canGuess(round, uid)) return fail("not-a-contender");
    // A locked guess is never overwritten, not even by a different value.
    if (stage.submitted.includes(uid)) return { ok: true, stageClosed: false, done: null };

    const now = new Date().toISOString();
    const deadline = guessDeadlineMs(stage);
    if (deadline !== null && Date.parse(now) >= deadline) return fail("stage-closed");
    const problem = checkEstimateGuess(input.guessMilli, stage.question);
    if (problem) return fail(GUESS_ERRORS[problem]);

    const secrets = secretsSnap.data() as EstimateSecrets;
    // The whole map, never a dotted field path: uids may contain hyphens.
    const guesses: Guesses = {
      ...secrets.guesses,
      [uid]: { milli: input.guessMilli, at: now, by: uid },
    };
    const submitted = [...stage.submitted, uid];
    const allIn = stage.contenders.every((contender) => submitted.includes(contender));
    if (!allIn) {
      tx.update(secretsRef, { guesses });
      tx.update(roundRef, {
        stages: [...round.stages.slice(0, -1), { ...stage, submitted }],
        updatedAt: now,
      });
      return { ok: true, stageClosed: false, done: null };
    }

    const plan = finishStage({
      groupRef,
      roundId: roundRef.id,
      round,
      stage: { ...stage, submitted },
      secrets: { ...secrets, guesses },
      seen: toSeen(seenSnap, now),
      group,
      t,
      now,
      reason: "all-in",
    });
    tx.update(secretsRef, { guesses });
    applyFinish(tx, { groupRef, roundRef }, plan);
    return { ok: true, stageClosed: true, done: { group, plan } };
  });
  if (!result.ok) return result;
  if (result.done) await afterFinish(input.groupId, groupRef, roundRef.id, result.done);
  return { ok: true, data: { stageClosed: result.stageClosed } };
}

/**
 * "Jetzt auswerten", once the window (+ grace) is over. Nobody can end the
 * guessing early. If someone has no guess the first call does NOT score: it
 * starts the last call (two more minutes, a push to the absent); the next
 * call after that scores, and a player with no guess ranks furthest.
 */
export async function closeEstimateStage(input: {
  groupId: string;
  roundId: string;
  stageIndex: number;
}): Promise<ActionResult<{ closed: boolean }>> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  if (!isRecord(input) || !isId(input.groupId) || !isId(input.roundId)) return fail("not-found");
  if (!Number.isSafeInteger(input.stageIndex) || input.stageIndex < 0) return fail("invalid-input");

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return fail(membership.error);
  const { groupRef } = membership;
  const roundRef = groupRef.collection("estimateRounds").doc(input.roundId);
  const secretsRef = secretsRefOf(roundRef, input.stageIndex);
  const t = await getServerT();
  const uid = session.uid;

  type Closed =
    | {
        ok: true;
        closed: boolean;
        done: AfterFinish | null;
        lastCall: { group: GroupDoc; stageIndex: number; uids: string[] } | null;
      }
    | Fail;
  const result = await adminDb.runTransaction<Closed>(async (tx) => {
    const [roundSnap, secretsSnap, groupSnap, seenSnap] = await Promise.all([
      tx.get(roundRef),
      tx.get(secretsRef),
      tx.get(groupRef),
      tx.get(seenRefOf(groupRef)),
    ]);
    if (!roundSnap.exists || !groupSnap.exists) return fail("not-found");
    const round = roundSnap.data() as RoundDoc;
    const group = groupSnap.data() as GroupDoc;
    if (round.mode !== "online") return fail("wrong-mode");
    // An entrant, the creator or a manager — a spectator-member adds noise, not information.
    const allowed =
      Object.hasOwn(round.entrants, uid) ||
      round.createdBy === uid ||
      isGroupManager(hasMember(group, uid) ? group.members[uid].role : undefined);
    if (!allowed) return fail("forbidden");
    if (round.status === "cancelled") return fail("round-not-running");

    const stage = round.stages[round.stages.length - 1];
    // A second tap, or a racing phone: already past this stage.
    if (
      input.stageIndex < stage.index ||
      (input.stageIndex === stage.index && stage.status === "revealed")
    ) {
      return { ok: true, closed: true, done: null, lastCall: null };
    }
    if (input.stageIndex !== stage.index) return fail("stale-stage");
    if (!secretsSnap.exists) return fail("not-found");

    const now = new Date().toISOString();
    const action = nextCloseAction(stage, Date.parse(now));
    // Also the answer while a last call is running: nobody ends it early.
    if (action === "wait") return fail("time-not-up");

    if (action === "last-call") {
      const absent = absentContenders(stage);
      tx.update(roundRef, {
        stages: [
          ...round.stages.slice(0, -1),
          { ...stage, lastCallAt: now, closesAt: isoPlus(now, ESTIMATE_LAST_CALL_MS) },
        ],
        updatedAt: now,
      });
      return {
        ok: true,
        closed: false,
        done: null,
        lastCall: { group, stageIndex: stage.index, uids: absent },
      };
    }

    const plan = finishStage({
      groupRef,
      roundId: roundRef.id,
      round,
      stage,
      secrets: secretsSnap.data() as EstimateSecrets,
      seen: toSeen(seenSnap, now),
      group,
      t,
      now,
      reason: "time-up",
    });
    applyFinish(tx, { groupRef, roundRef }, plan);
    return { ok: true, closed: true, done: { group, plan }, lastCall: null };
  });
  if (!result.ok) return result;
  if (result.lastCall) {
    notifyAfterResponse(
      estimateLastCallPushes({
        groupId: input.groupId,
        group: result.lastCall.group,
        roundId: roundRef.id,
        stageIndex: result.lastCall.stageIndex,
        uids: result.lastCall.uids,
        minutes: ESTIMATE_LAST_CALL_MS / 60_000,
      }),
    );
  }
  if (result.done) await afterFinish(input.groupId, groupRef, roundRef.id, result.done);
  return { ok: true, data: { closed: result.closed } };
}

/**
 * Calls a round off. Online: its creator or a manager, and only while nobody
 * has locked a guess — afterwards cancelling would be a way to throw away a
 * result you don't like ("Jetzt auswerten" ends a stuck round). One phone: only
 * the creator, any time before the submit. Cancelling twice is fine.
 */
export async function cancelEstimateRound(input: {
  groupId: string;
  roundId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  if (!isRecord(input) || !isId(input.groupId) || !isId(input.roundId)) return fail("not-found");

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return fail(membership.error);
  const { groupRef } = membership;
  const roundRef = groupRef.collection("estimateRounds").doc(input.roundId);
  const uid = session.uid;

  return adminDb.runTransaction<ActionResult<null>>(async (tx) => {
    const [roundSnap, groupSnap] = await Promise.all([tx.get(roundRef), tx.get(groupRef)]);
    if (!roundSnap.exists || !groupSnap.exists) return fail("not-found");
    const round = roundSnap.data() as RoundDoc;
    const group = groupSnap.data() as GroupDoc;

    if (round.mode === "local") {
      if (round.createdBy !== uid) return fail("not-creator");
    } else if (
      round.createdBy !== uid &&
      !isGroupManager(hasMember(group, uid) ? group.members[uid].role : undefined)
    ) {
      return fail("forbidden");
    }
    if (round.status === "cancelled") return { ok: true, data: null };
    if (round.status !== "running") return fail("round-not-running");
    if (
      round.mode === "online" &&
      (round.stages.length > 1 || round.stages[0].submitted.length > 0)
    ) {
      return fail("guesses-submitted");
    }

    const now = new Date().toISOString();
    tx.update(roundRef, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: uid,
      updatedAt: now,
    });
    if (group.activeEstimateRound?.id === roundRef.id) {
      tx.update(groupRef, { activeEstimateRound: null });
    }
    return { ok: true, data: null };
  });
}

// ---------------------------------------------------------------------------
// One phone: create, submit
// ---------------------------------------------------------------------------

/**
 * Starts a one-phone round: draws the question and returns the PUBLIC stage.
 * Placeholders may play (everyone is at the table). No pointer, no chat card,
 * no push, no bill: the expense form holds the bill, and a later `addExpense`
 * may claim the finished round.
 */
export async function createLocalEstimateRound(input: {
  groupId: string;
  poolUids: string[];
  targetLoserCount: number;
  includeFun: boolean;
}): Promise<ActionResult<{ roundId: string; stage: EstimateStage }>> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  if (!isRecord(input) || !isId(input.groupId)) return fail("not-found");

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return fail(membership.error);
  const { group, groupRef } = membership;

  if (typeof input.includeFun !== "boolean") return fail("invalid-input");
  const pool = checkPool(group, input.poolUids, false);
  if (!pool.ok) return pool;
  const { poolUids } = pool;
  if (!isValidEstimateCount(input.targetLoserCount, poolUids.length)) return fail("invalid-count");
  if (!hasEligibleStechfrage({ bank: ESTIMATE_BANK, includeFun: input.includeFun, exclude: [] })) {
    return fail("bank-empty");
  }

  const roundRef = groupRef.collection("estimateRounds").doc();
  const seenRef = seenRefOf(groupRef);
  const uid = session.uid;

  type Created = { ok: true; stage: EstimateStage } | Fail;
  const created = await adminDb.runTransaction<Created>(async (tx) => {
    const [groupSnap, seenSnap] = await Promise.all([tx.get(groupRef), tx.get(seenRef)]);
    if (!groupSnap.exists) return fail("not-found");
    const fresh = groupSnap.data() as GroupDoc;
    const stillPool = checkPool(fresh, poolUids, false);
    if (!stillPool.ok) return stillPool;
    if (!fresh.memberUids.includes(uid)) return fail("forbidden");

    const now = new Date().toISOString();
    const seen = toSeen(seenSnap, now);
    const recent = recentCreations(seen, uid, Date.parse(now));
    if (recent.length >= ESTIMATE_CREATE_CAP.max) return fail("rate-limited");

    const draw = drawEstimateQuestion({
      bank: ESTIMATE_BANK,
      seen: seen.seenIds,
      includeFun: input.includeFun,
      exclude: [],
      shuffle: secureShuffle,
    });
    const stage = openStage({
      index: 0,
      kind: "main",
      question: draw.question,
      contenders: poolUids,
      slots: input.targetLoserCount,
      now,
      windowMs: null,
    });
    const round: RoundDoc = {
      rulesVersion: ESTIMATE_RULES_VERSION,
      mode: "local",
      status: "running",
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      entrants: Object.fromEntries(
        poolUids.map((member) => [
          member,
          {
            displayName: fresh.members[member].displayName,
            isPlaceholder: fresh.members[member].isPlaceholder === true,
          },
        ]),
      ),
      // The table's seating is the hand-over order.
      order: poolUids,
      targetLoserCount: input.targetLoserCount,
      includeFun: input.includeFun,
      answerWindowMs: null,
      stages: [stage],
      loserUids: null,
      resolvedBy: null,
      stake: null,
      autoBook: null,
      expenseId: null,
      autoBookError: null,
    };
    tx.set(roundRef, round);
    tx.set(secretsRefOf(roundRef, 0), secretsFor(0, draw.question, now));
    tx.set(seenRef, {
      seenIds: draw.seen,
      resets: seen.resets + (draw.reset ? 1 : 0),
      recent: { ...seen.recent, [uid]: [...recent, now].slice(-ESTIMATE_CREATE_CAP.max) },
      updatedAt: now,
    } satisfies EstimateSeen);
    return { ok: true, stage };
  });
  if (!created.ok) return created;
  return { ok: true, data: { roundId: roundRef.id, stage: created.stage } };
}

/** The guesses a reveal row list holds, as `{ uid: milli }` (no-guess rows left out). */
function guessesOfReveal(stage: EstimateStage): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of stage.reveal?.results ?? []) {
    if (row.guessMilli !== null) out[row.uid] = row.guessMilli;
  }
  return out;
}

function sameGuesses(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && b[k] === a[k])
  );
}

/**
 * The one-phone table's guesses for the current stage, in one action: every
 * contender, all at once. All-or-nothing on purpose — a subset would let a
 * client "peek" by submitting one guess and reading the reveal. Only the
 * device owner (the round's creator) may submit. Returns the PUBLIC round,
 * which holds the truth only because this stage is revealed in this very call.
 * A replay of the identical payload (a lost response) answers the same round.
 */
export async function submitLocalEstimateGuesses(input: {
  groupId: string;
  roundId: string;
  stageIndex: number;
  guessesMilli: Record<string, number>;
}): Promise<ActionResult<{ round: EstimateRound }>> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  if (!isRecord(input) || !isId(input.groupId) || !isId(input.roundId)) return fail("not-found");
  if (!Number.isSafeInteger(input.stageIndex) || input.stageIndex < 0) return fail("invalid-input");

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return fail(membership.error);
  const { group: earlyGroup, groupRef } = membership;

  // Shape: a plain object, at most 32 keys, every key a member (own key: "constructor" is none), every value a safe integer.
  const raw = input.guessesMilli;
  if (!isRecord(raw)) return fail("invalid-input");
  const keys = Object.keys(raw);
  if (keys.length > ESTIMATE_MAX_PLAYERS) return fail("invalid-input");
  const payload: Record<string, number> = {};
  for (const key of keys) {
    const value = raw[key];
    if (
      !isId(key) ||
      !hasMember(earlyGroup, key) ||
      typeof value !== "number" ||
      !Number.isSafeInteger(value)
    ) {
      return fail("invalid-input");
    }
    payload[key] = value;
  }

  const roundRef = groupRef.collection("estimateRounds").doc(input.roundId);
  const secretsRef = secretsRefOf(roundRef, input.stageIndex);
  const t = await getServerT();
  const uid = session.uid;

  type Submitted = { ok: true; round: EstimateRound } | Fail;
  const result = await adminDb.runTransaction<Submitted>(async (tx) => {
    const [roundSnap, secretsSnap, groupSnap, seenSnap] = await Promise.all([
      tx.get(roundRef),
      tx.get(secretsRef),
      tx.get(groupRef),
      tx.get(seenRefOf(groupRef)),
    ]);
    if (!roundSnap.exists || !groupSnap.exists) return fail("not-found");
    const round = roundSnap.data() as RoundDoc;
    const group = groupSnap.data() as GroupDoc;
    if (round.mode !== "local") return fail("wrong-mode");
    if (round.createdBy !== uid) return fail("not-creator");

    // Idempotent replay: a lost response must not strand the table.
    const played = round.stages[input.stageIndex];
    if (played && played.status === "revealed") {
      return sameGuesses(guessesOfReveal(played), payload)
        ? { ok: true, round: { id: roundRef.id, ...round } }
        : fail("stage-closed");
    }
    if (round.status !== "running") return fail("round-not-running");
    const stage = round.stages[round.stages.length - 1];
    if (input.stageIndex !== stage.index) return fail("stale-stage");
    if (stage.status !== "guessing") return fail("stage-closed");
    if (!secretsSnap.exists) return fail("not-found");

    // Exactly the contenders.
    if (stage.contenders.some((contender) => !Object.hasOwn(payload, contender))) {
      return fail("guesses-missing");
    }
    if (keys.some((key) => !stage.contenders.includes(key))) return fail("guesses-unexpected");
    for (const contender of stage.contenders) {
      const problem = checkEstimateGuess(payload[contender], stage.question);
      if (problem) return fail(GUESS_ERRORS[problem]);
    }

    const now = new Date().toISOString();
    const secrets = secretsSnap.data() as EstimateSecrets;
    const guesses: Guesses = {};
    for (const contender of stage.contenders) {
      guesses[contender] = { milli: payload[contender], at: now, by: uid };
    }
    const plan = finishStage({
      groupRef,
      roundId: roundRef.id,
      round,
      stage,
      secrets: { ...secrets, guesses },
      seen: toSeen(seenSnap, now),
      group,
      t,
      now,
      reason: "local",
    });
    tx.update(secretsRef, { guesses });
    applyFinish(tx, { groupRef, roundRef }, plan);
    return { ok: true, round: { id: roundRef.id, ...plan.round } };
  });
  if (!result.ok) return result;
  return { ok: true, data: { round: result.round } };
}
