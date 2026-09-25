"use client";

import { type CSSProperties } from "react";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import type { GroupMember } from "@/lib/types";

/**
 * Shared "who's playing" member checklist — the part of the setup step every
 * split mini-game needs, split out from `GamePoolSetupStep` so a game that
 * has no "how many pay" concept (the slot machine's staked spins, for one)
 * can use just this half.
 */
export function GamePoolChecklist({
  memberUids,
  members,
  poolUids,
  onTogglePoolMember,
}: {
  memberUids: string[];
  members: Record<string, GroupMember>;
  poolUids: string[];
  onTogglePoolMember: (uid: string) => void;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-2">
      <Label id="game-pool-label">{t("expenses.gamePoolLabel")}</Label>
      <div role="group" aria-labelledby="game-pool-label" className="flex flex-col gap-1.5">
        {memberUids.map((uid, index) => {
          const name = members[uid].displayName;
          const selected = poolUids.includes(uid);
          return (
            <label
              key={uid}
              style={{ "--stagger": index } as CSSProperties}
              className={cn(
                "has-focus-visible:ring-ring/50 ease-spring animate-rise active:shadow-pressed flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) select-none active:scale-[0.99] has-focus-visible:ring-3",
                selected
                  ? "border-primary/40 bg-primary/5 shadow-e1"
                  : "border-border bg-background",
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onTogglePoolMember(uid)}
                className="sr-only"
              />
              <GameAvatar
                name={name}
                className={cn(
                  "size-9 text-sm transition-all duration-(--duration-fast)",
                  !selected && "opacity-40 grayscale",
                )}
              />
              <span
                className={cn(
                  "flex-1 truncate text-sm font-medium",
                  !selected && "text-muted-foreground",
                )}
              >
                {name}
              </span>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--duration-fast)",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {selected && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 6 9 17l-5-5"
                      pathLength={1}
                      className="animate-draw-stroke [--stroke-length:1]"
                    />
                  </svg>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {poolUids.length < 2 && (
        <p className="text-muted-foreground text-xs">{t("expenses.gamePoolMinHint")}</p>
      )}
    </div>
  );
}
