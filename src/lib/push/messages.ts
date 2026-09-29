import { formatMoney } from "@/lib/format/money";
import { DUEL_GAME_META } from "@/lib/games/duel-game-ids";
import type { TranslationKey } from "@/lib/i18n/translate";
import type {
  DuelGameId,
  Expense,
  Group,
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

/** Matches a bracket update just made playable — both players known, not started. */
export function newlyReadyMatches(
  before: Record<string, TournamentMatch>,
  after: Record<string, TournamentMatch>,
): TournamentMatch[] {
  return Object.values(after).filter(
    (match) => match.status === "ready" && before[match.id]?.status !== "ready",
  );
}
