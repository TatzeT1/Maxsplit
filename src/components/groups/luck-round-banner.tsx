"use client";

import { ChevronRight, Ticket } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/locale-provider";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { useLuckRound } from "@/lib/games/use-luck-round";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/types";

/**
 * Shows up on the group page while an online luck round runs. The group
 * document says *that* one runs (`activeLuckRound`), so a group without one
 * costs no extra listener; only while a round runs does the banner read it,
 * to say whether your own card is still waiting.
 */
export function LuckRoundBanner({ group, currentUid }: { group: Group; currentUid: string }) {
  const t = useT();
  const active = group.activeLuckRound ?? null;
  const { round, errorCode } = useLuckRound(group.id, active?.id ?? null);

  if (!active) return null;

  // Per AGENTS.md: a failed listener must never look like "nothing running".
  if (errorCode) {
    return (
      <div className="border-destructive/50 text-destructive flex flex-col gap-0.5 rounded-xl border p-3">
        <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
        <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
      </div>
    );
  }

  const meta = SPLIT_GAME_META[active.gameId];
  const yourCardWaiting =
    !!round && currentUid in round.entrants && !(currentUid in round.revealed);
  const done = round ? Object.keys(round.revealed).length : 0;
  const total = round ? round.order.length : 0;

  return (
    <Link
      href={`/groups/${group.id}/rounds/${active.id}`}
      className={cn(
        "bg-card ring-foreground/10 hover:ring-primary/40 hover:shadow-e1 relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl p-3 ring-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]",
        yourCardWaiting && "bg-primary/5 ring-primary/50",
      )}
    >
      <div className="from-primary/20 to-primary/5 text-primary relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br">
        <Ticket className="h-4.5 w-4.5" />
        {yourCardWaiting && (
          <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
            <span className="bg-primary/70 animate-breathe absolute inline-flex h-full w-full rounded-full" />
            <span className="bg-primary ring-card relative inline-flex h-2.5 w-2.5 rounded-full ring-2" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {meta.emoji} {t("expenses.luckBannerTitle")}
        </span>
        <p
          className={cn(
            "truncate text-xs",
            yourCardWaiting ? "text-primary font-semibold" : "text-muted-foreground",
          )}
        >
          {yourCardWaiting
            ? t("expenses.luckBannerYourCard")
            : round
              ? t("expenses.luckBannerProgress", { done, total })
              : // Still loading the round: the title alone is enough for a beat.
                ""}
        </p>
      </div>
      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
    </Link>
  );
}
