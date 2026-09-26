"use client";

import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import type { GroupMember } from "@/lib/types";

/**
 * "Duell n von k" strip above the board, with already-decided payers shown
 * dimmed alongside it — every duel game always plays exactly
 * `targetLoserCount` matches (one loser per match), so the total is fixed up
 * front rather than depending on how many challengers are still queued.
 * Hidden for a plain 2-person duel (`targetLoserCount` of 1), where a
 * "duel 1 of 1" label would only be noise.
 */
export function DuelLadderStrip({
  matchNumber,
  targetLoserCount,
  losers,
  members,
}: {
  matchNumber: number;
  targetLoserCount: number;
  losers: string[];
  members: Record<string, GroupMember>;
}) {
  const t = useT();
  if (targetLoserCount <= 1) return null;

  return (
    <div className="bg-muted/40 flex items-center justify-between gap-2 rounded-xl border p-2.5">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t("expenses.duelMatchEyebrow", { number: matchNumber, total: targetLoserCount })}
      </span>
      {losers.length > 0 && (
        <div aria-hidden="true" className="flex -space-x-1.5">
          {losers.map((uid) => (
            <GameAvatar
              key={uid}
              name={members[uid].displayName}
              className="ring-popover size-6 text-[10px] opacity-50 ring-2 grayscale"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown between matches: who's up next, and who moves first. */
export function DuelHandoffCard({
  players,
  members,
}: {
  players: [string, string];
  members: Record<string, GroupMember>;
}) {
  const t = useT();
  const nameA = members[players[0]].displayName;
  const nameB = members[players[1]].displayName;

  return (
    <div className="border-primary/30 bg-primary/5 animate-rise flex flex-col items-center gap-3 rounded-xl border p-4 text-center">
      <div className="flex items-center gap-2">
        <GameAvatar name={nameA} className="size-10 text-sm" />
        <span className="text-muted-foreground text-xs font-medium">
          {t("expenses.duelVersus", { a: nameA, b: nameB })}
        </span>
        <GameAvatar name={nameB} className="size-10 text-sm" />
      </div>
      <p className="text-sm">{t("expenses.duelHandoffHint", { a: nameA, b: nameB })}</p>
      <p className="text-muted-foreground text-xs">{t("expenses.duelStarts", { name: nameA })}</p>
    </div>
  );
}

/** Shown over the (locked) board for a beat after a draw, before the match replays. */
export function DuelDrawNotice() {
  const t = useT();
  return (
    <div className="border-border bg-muted/60 animate-rise flex items-center justify-center rounded-xl border border-dashed p-2.5 text-center">
      <span className="text-sm font-medium">{t("expenses.duelDrawNotice")}</span>
    </div>
  );
}
