"use client";

import type { ReactNode } from "react";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import type { GroupMember } from "@/lib/types";

/**
 * "Am Zug: NAME" banner for the turn-based duel boards (Tic-Tac-Toe, Connect
 * Four, Memory-Duell) — the same layout the lottery's turn indicator uses,
 * reused here since whose turn it is within a match is board-internal state
 * the shared `DuelGameDialog` shell doesn't track.
 */
export function DuelTurnBanner({
  uid,
  members,
  hint,
  aside,
}: {
  uid: string;
  members: Record<string, GroupMember>;
  hint?: string;
  aside?: ReactNode;
}) {
  const t = useT();
  const name = members[uid].displayName;

  return (
    <div className="bg-muted/40 flex items-center gap-3 rounded-xl border p-3">
      <GameAvatar name={name} className="ring-popover size-10 text-sm ring-2" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {t("expenses.duelTurnEyebrow")}
        </span>
        <span className="font-heading truncate text-lg leading-tight font-medium">{name}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {aside}
    </div>
  );
}
