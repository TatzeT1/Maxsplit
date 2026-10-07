"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { DialogDescription } from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { ConfettiBurst, celebrationColors } from "@/components/groups/split-game/celebration";
import { useGameHasStake } from "@/components/groups/split-game/tournament/tournament-fate";
import { formatMoney } from "@/lib/format/money";
import { memberColor } from "@/lib/games/member-colors";
import { stakeShares, type GameStake } from "@/lib/games/payers";
import { STAGGER_STEP } from "@/lib/motion";
import { cn, nameHash } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

/**
 * Shared "X pays" verdict banner, shown once a luck game's round is fully
 * resolved, so a round always lands the same way regardless of which game
 * produced it.
 *
 * It arrives after the last catch's takeover has cleared, as the round's
 * finale: the payers' avatars spring up one after another, each with a ring
 * in their own color, and a last confetti burst in all of their colors goes
 * up from the row.
 *
 * With a `stake`, each payer's share is printed under their face. It is
 * worked out here, from the very `loserUids` the banner shows — the list the
 * game hands to `onResolve` — with the `splitEqual` the form books with, so
 * the banner can't disagree with the expense about who carries a rounding
 * cent. No amount (the game was opened before one was typed): no shares.
 */
export function GameResultBanner({
  loserUids,
  members,
  stake,
  inDialog = true,
}: {
  loserUids: string[];
  members: Record<string, GroupMember>;
  /** The bill being played for; display only. */
  stake?: GameStake | null;
  /** `DialogDescription` needs Dialog context — set false on a standalone page (the tournament route). */
  inDialog?: boolean;
}) {
  const t = useT();
  const ResultText = inDialog ? DialogDescription : "p";
  const reduceMotion = useReducedMotion();
  const avatarsRef = useRef<HTMLDivElement | null>(null);
  // A game played just for fun has nobody paying — its losers just lose.
  const withStake = useGameHasStake();
  const loserNames = loserUids.map((uid) => members[uid].displayName);
  const shares = withStake && stake ? stakeShares(stake, loserUids) : null;
  const shareText = (uid: string) =>
    shares && stake ? formatMoney(shares[uid], stake.currency) : "";
  const resultText =
    loserNames.length === 1
      ? t(withStake ? "expenses.gameResultOne" : "expenses.gameResultOneFree", {
          name: loserNames[0],
        })
      : t(withStake ? "expenses.gameResultMultiple" : "expenses.gameResultMultipleFree", {
          names: loserNames.join(", "),
        });
  const announcement = shares
    ? [
        resultText,
        loserUids
          .map((uid, index) =>
            t("expenses.gameResultShareItem", { name: loserNames[index], amount: shareText(uid) }),
          )
          .join(", "),
      ].join(" ")
    : resultText;

  return (
    <div className="border-primary/30 bg-primary/5 animate-rise relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border p-4 text-center">
      {/* Visible text alone doesn't get announced on arrival — this is the state change screen readers actually hear. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <span
        aria-hidden="true"
        className="bg-primary/25 animate-bloom pointer-events-none absolute -top-10 left-1/2 size-28 -translate-x-1/2 rounded-full blur-2xl"
      />
      <span className="text-muted-foreground relative text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t("expenses.gameResultEyebrow")}
      </span>
      {/* With amounts each face gets a column of its own; without, they overlap like a hand of cards. */}
      <div
        ref={avatarsRef}
        className={cn(
          "relative flex",
          shares ? "flex-wrap justify-center gap-x-3 gap-y-2" : "-space-x-2",
        )}
      >
        {loserNames.map((name, index) => {
          const delay = 0.08 + index * STAGGER_STEP * 2;
          return (
            <motion.span
              key={loserUids[index]}
              className={cn("relative flex flex-col items-center gap-1", !shares && "rounded-full")}
              initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 420, damping: 13, mass: 0.8, delay }
              }
            >
              <span className="relative block rounded-full">
                <span
                  aria-hidden="true"
                  className="animate-settle-ring pointer-events-none absolute inset-0 rounded-full border-2"
                  style={{
                    borderColor: memberColor(name),
                    animationDelay: `${Math.round((delay + 0.12) * 1000)}ms`,
                  }}
                />
                <GameAvatar name={name} className="ring-popover size-10 text-sm ring-2" />
              </span>
              {shares && (
                <span className="font-heading tabular-money text-sm leading-none font-medium">
                  <span className="sr-only">{name}: </span>
                  {shareText(loserUids[index])}
                </span>
              )}
            </motion.span>
          );
        })}
      </div>
      <ResultText className="font-heading text-foreground relative text-lg font-medium">
        {resultText}
      </ResultText>
      <ConfettiBurst
        anchorRef={avatarsRef}
        seed={nameHash(loserNames.join("|"))}
        colors={celebrationColors(loserNames)}
        count={64}
        power={1.2}
        delay={0.1}
      />
    </div>
  );
}
