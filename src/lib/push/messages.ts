import { formatMoney } from "@/lib/format/money";
import { DUEL_GAME_META } from "@/lib/games/duel-game-ids";
import { estimateRoundPath } from "@/lib/games/round-paths";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { isGroupManager } from "@/lib/groups/permissions";
import type { TranslationKey } from "@/lib/i18n/translate";
import type {
  DuelGameId,
  Expense,
  Group,
  LuckRound,
  OnlineLuckGameId,
  Settlement,
  Tournament,
  TournamentMatch,
} from "@/lib/types";
import type { PendingPush, PushText } from "./types";

// Who gets which push, and what it says — pure, so the rules are unit tested
// apart from Firestore and the push services. Server Actions (and the
// recurring cron) call these after their write and hand the result to
// notifyAfterResponse (./notify.ts).

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

type GroupInfo = Pick<Group, "name" | "members" | "memberUids">;

/** Only real members have an account, and so a device; placeholders never get a push. */
function hasAccount(group: GroupInfo, uid: string): boolean {
  return group.memberUids.includes(uid);
}

function groupTitle(group: GroupInfo): PushText {
  return { key: "push.groupTitle", vars: { group: group.name } };
}

export type ExpenseOrigin = "added" | "recurring" | "game";

const EXPENSE_LEAD = {
  added: "push.expenseAdded",
  recurring: "push.expenseRecurring",
  game: "push.expenseGame",
} as const satisfies Record<ExpenseOrigin, TranslationKey>;

/**
 * "Neue Ausgabe mit dir": to everyone the expense touches — a share of it or
 * money laid out for it — except whoever entered it and anyone in `skip`
 * (a game's players, who just watched it being decided). Says what it does
 * to your balance: "du schuldest dafür 20,00 €" / "du bekommst 60,00 € zurück".
 */
export function expensePushes(input: {
  groupId: string;
  group: GroupInfo;
  expenseId: string;
  expense: Pick<Expense, "description" | "currency" | "paidBy" | "splits">;
  origin: ExpenseOrigin;
  /** Who entered it; null when the cron booked it. */
  actorUid: string | null;
  skip?: readonly string[];
}): PendingPush[] {
  const { group, expense } = input;
  const actor = input.actorUid ? (group.members[input.actorUid]?.displayName ?? "") : "";
  const involved = new Set([...Object.keys(expense.paidBy), ...Object.keys(expense.splits)]);
  const pushes: PendingPush[] = [];

  for (const uid of involved) {
    if (uid === input.actorUid || input.skip?.includes(uid) || !hasAccount(group, uid)) continue;
    const share = expense.splits[uid]?.amountMinor ?? 0;
    const paid = expense.paidBy[uid] ?? 0;
    if (share <= 0 && paid <= 0) continue;

    const body: PushText[] = [
      {
        key: EXPENSE_LEAD[input.origin],
        vars: { actor, description: expense.description },
      },
    ];
    const net = paid - share;
    if (net !== 0) {
      body.push({
        key: net < 0 ? "push.impactOwe" : "push.impactGetBack",
        vars: { amount: formatMoney(Math.abs(net), expense.currency) },
      });
    }
    pushes.push({
      uid,
      event: "expense",
      title: groupTitle(group),
      body,
      url: `/groups/${input.groupId}`,
      tag: `expense-${input.expenseId}`,
      ttlSeconds: DAY,
    });
  }
  return pushes;
}

const CHAT_PREVIEW_LENGTH = 120;

/**
 * "Ungelesene Chat-Nachricht": to every other member with an account. One tag
 * per group chat, so several messages replace each other instead of piling up.
 */
export function chatPushes(input: {
  groupId: string;
  group: GroupInfo;
  text: string;
  actorUid: string;
}): PendingPush[] {
  const { group } = input;
  const name = group.members[input.actorUid]?.displayName ?? "";
  const collapsed = input.text.replace(/\s+/g, " ").trim();
  const text =
    collapsed.length > CHAT_PREVIEW_LENGTH
      ? `${collapsed.slice(0, CHAT_PREVIEW_LENGTH - 1)}…`
      : collapsed;
  return group.memberUids
    .filter((uid) => uid !== input.actorUid && hasAccount(group, uid))
    .map((uid) => ({
      uid,
      event: "chat",
      title: { key: "push.chatTitle", vars: { group: group.name } },
      body: [{ key: "push.chatMessage", vars: { name, text } }],
      url: `/groups/${input.groupId}/chat`,
      tag: `chat-${input.groupId}`,
      ttlSeconds: DAY,
    }));
}

/** "Zahlung erhalten": to whoever the money went to — unless they entered it themselves. */
export function settlementPushes(input: {
  groupId: string;
  group: GroupInfo;
  settlementId: string;
  settlement: Pick<Settlement, "fromUid" | "toUid" | "amountMinor" | "currency">;
  actorUid: string;
}): PendingPush[] {
  const { group, settlement } = input;
  if (settlement.toUid === input.actorUid || !hasAccount(group, settlement.toUid)) return [];
  return [
    {
      uid: settlement.toUid,
      event: "settlement",
      title: groupTitle(group),
      body: [
        {
          key: "push.settlementReceived",
          vars: {
            from: group.members[settlement.fromUid]?.displayName ?? "",
            amount: formatMoney(settlement.amountMinor, settlement.currency),
          },
        },
      ],
      url: `/groups/${input.groupId}?tab=balances`,
      tag: `settlement-${input.settlementId}`,
      ttlSeconds: DAY,
    },
  ];
}

function gameName(gameId: DuelGameId): { key: TranslationKey } {
  return { key: DUEL_GAME_META[gameId].titleKey };
}

function tournamentUrl(groupId: string, tournamentId: string): string {
  return `/groups/${groupId}/tournaments/${tournamentId}`;
}

/** "Herausforderung": everyone drawn into an online game, except the challenger. */
export function challengePushes(input: {
  groupId: string;
  group: GroupInfo;
  tournamentId: string;
  gameId: DuelGameId;
  stake: Tournament["stake"];
  poolUids: readonly string[];
  actorUid: string;
}): PendingPush[] {
  const { group, stake } = input;
  const name = group.members[input.actorUid]?.displayName ?? "";
  const game = gameName(input.gameId);
  const body: PushText = stake
    ? {
        key: "push.challengeStake",
        vars: {
          name,
          game,
          stake: `${stake.description} · ${formatMoney(stake.amountMinor, stake.currency)}`,
        },
      }
    : { key: "push.challenge", vars: { name, game } };
  return input.poolUids
    .filter((uid) => uid !== input.actorUid && hasAccount(group, uid))
    .map((uid) => ({
      uid,
      event: "challenge",
      title: { key: "push.challengeTitle", vars: { group: group.name } },
      body: [body],
      url: tournamentUrl(input.groupId, input.tournamentId),
      tag: `challenge-${input.tournamentId}`,
      // A challenge nobody sees within hours has usually been played without them.
      ttlSeconds: 6 * HOUR,
    }));
}

/** Where an online luck round is played. */
export function luckRoundUrl(groupId: string, roundId: string): string {
  return `/groups/${groupId}/rounds/${roundId}`;
}

/**
 * "Herausforderung" for an online luck round: everyone with a card waiting,
 * except whoever started it. Same switch as a duel's challenge.
 */
export function luckChallengePushes(input: {
  groupId: string;
  group: GroupInfo;
  roundId: string;
  gameId: OnlineLuckGameId;
  stake: LuckRound["stake"];
  poolUids: readonly string[];
  actorUid: string;
}): PendingPush[] {
  const { group, stake } = input;
  const name = group.members[input.actorUid]?.displayName ?? "";
  const body: PushText = {
    key: "push.luckChallenge",
    vars: {
      name,
      game: { key: SPLIT_GAME_META[input.gameId].nameKey },
      stake: `${stake.description} · ${formatMoney(stake.amountMinor, stake.currency)}`,
    },
  };
  return input.poolUids
    .filter((uid) => uid !== input.actorUid && hasAccount(group, uid))
    .map((uid) => ({
      uid,
      event: "challenge",
      title: { key: "push.challengeTitle", vars: { group: group.name } },
      body: [body],
      url: luckRoundUrl(input.groupId, input.roundId),
      tag: `challenge-${input.roundId}`,
      ttlSeconds: 6 * HOUR,
    }));
}

// Estimate rounds ("Schätzfragen"). Not one of these carries a question or a
// truth: they are built from names, the stake and a time, never from the round
// document, so a lock screen can't spoil a question before the table has
// guessed it (messages.test.ts pins the set of variables).

/** What an estimate push calls the game — the same name the picker and the chat use. */
function estimateGameName(): { key: TranslationKey } {
  return { key: SPLIT_GAME_META.estimate.nameKey };
}

/**
 * "Herausforderung" for an online estimate round: everyone in the pool with an
 * account, except whoever started it. Like `luckChallengePushes`, but it states
 * the window and the consequence ("wer nicht tippt, zahlt zuerst"), and goes
 * stale with the window: a challenge whose time is up cannot be answered.
 */
export function estimateChallengePushes(input: {
  groupId: string;
  group: GroupInfo;
  roundId: string;
  stake: { description: string; amountMinor: number; currency: string };
  poolUids: readonly string[];
  actorUid: string;
  /** The answer window, in minutes (5, 15 or 60). */
  minutes: number;
}): PendingPush[] {
  const { group, stake } = input;
  const body: PushText = {
    key: "push.estimateChallenge",
    vars: {
      name: group.members[input.actorUid]?.displayName ?? "",
      game: estimateGameName(),
      stake: `${stake.description} · ${formatMoney(stake.amountMinor, stake.currency)}`,
      minutes: input.minutes,
    },
  };
  return [...new Set(input.poolUids)]
    .filter((uid) => uid !== input.actorUid && hasAccount(group, uid))
    .map((uid) => ({
      uid,
      event: "challenge",
      title: { key: "push.challengeTitle", vars: { group: group.name } },
      body: [body],
      url: estimateRoundPath(input.groupId, input.roundId),
      tag: `challenge-${input.roundId}`,
      ttlSeconds: input.minutes * 60,
    }));
}

/**
 * "Gleichstand": a tie opened a Stechfrage, and only the players it concerns
 * (`uids`, the stage's contenders) are asked to guess again. Sent as a turn, but
 * without `unlessWatching` — nothing tracks who has the round page open yet.
 */
export function estimateStechenPushes(input: {
  groupId: string;
  group: GroupInfo;
  roundId: string;
  stageIndex: number;
  uids: readonly string[];
}): PendingPush[] {
  const { group } = input;
  return [...new Set(input.uids)]
    .filter((uid) => hasAccount(group, uid))
    .map((uid) => ({
      uid,
      event: "turn",
      title: { key: "push.turnTitle" },
      body: [
        {
          key: "push.estimateStechen",
          vars: { game: estimateGameName(), group: group.name },
        },
      ],
      url: estimateRoundPath(input.groupId, input.roundId),
      tag: `estimate-stechen-${input.roundId}-${input.stageIndex}`,
      // A tiebreaker from ten minutes ago is old news.
      ttlSeconds: 10 * 60,
    }));
}

/**
 * "Letzte Chance": someone started the last call, so the players still without
 * a guess (`uids`) have `minutes` left before the round is scored and they pay
 * first. Its own tag, so it doesn't replace the Stechfrage push of the same stage.
 */
export function estimateLastCallPushes(input: {
  groupId: string;
  group: GroupInfo;
  roundId: string;
  stageIndex: number;
  uids: readonly string[];
  minutes: number;
}): PendingPush[] {
  const { group } = input;
  return [...new Set(input.uids)]
    .filter((uid) => hasAccount(group, uid))
    .map((uid) => ({
      uid,
      event: "turn",
      title: { key: "push.turnTitle" },
      body: [
        {
          key: "push.estimateLastCall",
          vars: { game: estimateGameName(), group: group.name, minutes: input.minutes },
        },
      ],
      url: estimateRoundPath(input.groupId, input.roundId),
      tag: `estimate-lastcall-${input.roundId}-${input.stageIndex}`,
      // The last call lasts a couple of minutes; a later one is pointless.
      ttlSeconds: 5 * 60,
    }));
}

/**
 * A scored round that could not book its bill (a payer left meanwhile): without
 * this the loser escapes silently — the chat card has no amount and nobody is
 * told. Goes to the round's creator (`actorUid`) and the group's managers with
 * an account, who are asked to enter the expense by hand. `names` is the
 * already-joined list of who pays, `description` what they pay for.
 */
export function estimateNotBookedPushes(input: {
  groupId: string;
  group: GroupInfo;
  roundId: string;
  /** The round's creator — told even when they are no manager. */
  actorUid: string;
  names: string;
  description: string;
}): PendingPush[] {
  const { group } = input;
  const body: PushText = {
    key: "push.estimateNotBooked",
    vars: { game: estimateGameName(), names: input.names, description: input.description },
  };
  return group.memberUids
    .filter((uid) => uid === input.actorUid || isGroupManager(group.members[uid]?.role))
    .map((uid) => ({
      uid,
      event: "challenge",
      title: groupTitle(group),
      body: [body],
      url: estimateRoundPath(input.groupId, input.roundId),
      tag: `estimate-notbooked-${input.roundId}`,
      // Someone has to act on it by hand, so it stays around for a day.
      ttlSeconds: DAY,
    }));
}

/**
 * "Du bist dran": the opponent moved ("move"), or your next match is ready
 * and waiting ("ready"). Skipped while you're looking at the game — see
 * `unlessWatching` and markTournamentPresence.
 */
export function turnPush(input: {
  uid: string;
  opponentName: string;
  reason: "move" | "ready";
  groupId: string;
  group: GroupInfo;
  tournamentId: string;
  matchId: string;
  gameId: DuelGameId;
}): PendingPush {
  return {
    uid: input.uid,
    event: "turn",
    title: { key: "push.turnTitle" },
    body: [
      {
        key: input.reason === "move" ? "push.turnMove" : "push.turnReady",
        vars: { name: input.opponentName, game: gameName(input.gameId), group: input.group.name },
      },
    ],
    url: tournamentUrl(input.groupId, input.tournamentId),
    tag: `turn-${input.tournamentId}-${input.matchId}`,
    // A turn from ten minutes ago is old news.
    ttlSeconds: 10 * 60,
    unlessWatching: { groupId: input.groupId, tournamentId: input.tournamentId },
  };
}

/**
 * "Anstupsen": the player an online match has been waiting on gets a fresh
 * "Du bist dran". Its own tag (with the time), so it buzzes even while an
 * earlier "Du bist dran" for the same match is still on screen — a same-tag
 * notification would replace that one silently. Skipped like any turn push
 * while they are watching the game.
 */
export function nudgePush(input: {
  uid: string;
  byName: string;
  groupId: string;
  group: GroupInfo;
  tournamentId: string;
  matchId: string;
  gameId: DuelGameId;
  at: string;
}): PendingPush {
  return {
    uid: input.uid,
    event: "turn",
    title: { key: "push.turnTitle" },
    body: [
      {
        key: "push.turnNudge",
        vars: { name: input.byName, game: gameName(input.gameId), group: input.group.name },
      },
    ],
    url: tournamentUrl(input.groupId, input.tournamentId),
    tag: `nudge-${input.tournamentId}-${input.matchId}-${input.at}`,
    ttlSeconds: 10 * 60,
    unlessWatching: { groupId: input.groupId, tournamentId: input.tournamentId },
  };
}

/** Matches a bracket update just made playable — both players known, not started. */
export function newlyReadyMatches(
  before: Record<string, TournamentMatch>,
  after: Record<string, TournamentMatch>,
): TournamentMatch[] {
  return Object.values(after).filter(
    (match) => match.status === "ready" && before[match.id]?.status !== "ready",
  );
}
