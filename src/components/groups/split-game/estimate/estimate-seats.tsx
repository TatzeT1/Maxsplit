"use client";

import { Check, Eye, Hourglass } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { cn } from "@/lib/utils";
import type { EstimateRound, EstimateStage, GroupMember } from "@/lib/types";

function nameOf(
  uid: string,
  round: Pick<EstimateRound, "entrants">,
  members: Record<string, GroupMember>,
): string {
  if (Object.hasOwn(members, uid)) return members[uid].displayName;
  if (Object.hasOwn(round.entrants, uid)) return round.entrants[uid].displayName;
  return "?";
}

/**
 * Who has answered, and who has not. One row per contender of the stage in
 * seat order, with the avatar, the name and the state in words: "getippt" /
 * "tippt noch" / "kein Tipp" (a revealed stage the player never answered).
 * In a Stechfrage the entrants who are out of it stay listed as "schaut zu".
 *
 * Holds booleans only: the stage document carries who has locked a guess,
 * never the value (the secret guesses are server-side), so there is nothing
 * here that could leak one. No placeholder seats: online rounds have accounts
 * only. Render it AFTER the keyboard frame.
 */
export function EstimateSeats({
  stage,
  round,
  members,
  currentUid,
}: {
  stage: EstimateStage;
  round: EstimateRound;
  members: Record<string, GroupMember>;
  currentUid: string;
}) {
  const t = useT();
  const seatOrder = [
    ...round.order.filter((uid) => stage.contenders.includes(uid)),
    ...stage.contenders.filter((uid) => !round.order.includes(uid)),
  ];
  const watching = Object.keys(round.entrants).filter((uid) => !stage.contenders.includes(uid));
  const done = stage.contenders.filter((uid) => stage.submitted.includes(uid)).length;

  function stateOf(uid: string) {
    if (stage.submitted.includes(uid)) {
      return { text: t("expenses.estimateSeatDone"), tone: "done" as const };
    }
    if (stage.status === "revealed") {
      return { text: t("expenses.estimateNoGuess"), tone: "none" as const };
    }
    return { text: t("expenses.estimateSeatWaiting"), tone: "waiting" as const };
  }

  return (
    <section data-slot="estimate-seats" className="flex flex-col gap-2">
      <p className="text-muted-foreground text-center text-xs">
        {t("expenses.estimateProgress", { done, total: stage.contenders.length })}
      </p>
      <ul className="bg-card ring-foreground/10 flex flex-col divide-y overflow-hidden rounded-xl ring-1">
        {seatOrder.map((uid) => {
          const name = nameOf(uid, round, members);
          const state = stateOf(uid);
          return (
            <li key={uid} className="flex min-h-11 items-center gap-3 px-3 py-2">
              <GameAvatar name={name} className="size-8 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {name}
                {uid === currentUid && (
                  <span className="text-primary ml-1.5 text-xs font-semibold">
                    {t("expenses.estimateYouTag")}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 text-xs font-medium",
                  state.tone === "done" && "text-success",
                  state.tone === "waiting" && "text-muted-foreground",
                  state.tone === "none" && "text-destructive",
                )}
              >
                {state.tone === "done" ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : state.tone === "waiting" ? (
                  <Hourglass aria-hidden="true" className="size-3.5" />
                ) : null}
                {state.text}
              </span>
            </li>
          );
        })}
        {watching.map((uid) => {
          const name = nameOf(uid, round, members);
          return (
            <li
              key={uid}
              className="text-muted-foreground flex min-h-11 items-center gap-3 px-3 py-2 opacity-70"
            >
              <GameAvatar name={name} className="size-8 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {name}
                {uid === currentUid && (
                  <span className="ml-1.5 text-xs font-semibold">
                    {t("expenses.estimateYouTag")}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs">
                <Eye aria-hidden="true" className="size-3.5" />
                {t("expenses.estimateSeatWatching")}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
