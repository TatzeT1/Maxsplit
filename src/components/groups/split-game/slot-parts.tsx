"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { AnimatedMoney } from "@/components/ui/animated-money";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format/money";
import {
  SLOT_PAYTABLE,
  SLOT_TOTAL_WEIGHT,
  type SlotGameState,
  type SlotOutcomeKind,
  type SlotPrize,
  type SlotSymbol,
} from "@/lib/games/slot-machine";
import { ConfettiBurst, celebrationColors } from "@/components/groups/split-game/celebration";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { SlotSymbolFace, type PrizeFace } from "@/components/groups/split-game/slot-fx";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { GroupMember } from "@/lib/types";

/*
 * The slot machine's smaller pieces, split out of `split-slot-dialog.tsx`:
 * the reel symbol, the paytable, the running tally with each person's
 * streak, shield and boost, and the award show at the end.
 */

/** Row height in px — the classic three-row window with the payline in the middle. */
export const ROW_HEIGHT = 64;

export const OUTCOME_TITLE: Record<SlotOutcomeKind, TranslationKey> = {
  miss: "expenses.slotOutcomeMiss",
  pair: "expenses.slotOutcomePair",
  lemons: "expenses.slotOutcomeLemons",
  cherries: "expenses.slotOutcomeCherries",
  bells: "expenses.slotOutcomeBells",
  stars: "expenses.slotOutcomeStars",
  clover: "expenses.slotOutcomeClover",
  receipt: "expenses.slotOutcomeReceipt",
  wheel: "expenses.slotOutcomeWheel",
  gift: "expenses.slotOutcomeGift",
  duel: "expenses.slotOutcomeDuel",
  ghost: "expenses.slotOutcomeGhost",
  bombs: "expenses.slotOutcomeBombs",
  jackpot: "expenses.slotOutcomeJackpot",
};

export const OUTCOME_DETAIL: Record<SlotOutcomeKind, TranslationKey> = {
  miss: "expenses.slotOutcomeMissDetail",
  pair: "expenses.slotOutcomePairDetail",
  lemons: "expenses.slotOutcomeLemonsDetail",
  cherries: "expenses.slotOutcomeCherriesDetail",
  bells: "expenses.slotOutcomeBellsDetail",
  stars: "expenses.slotOutcomeStarsDetail",
  clover: "expenses.slotOutcomeCloverDetail",
  receipt: "expenses.slotOutcomeReceiptDetail",
  wheel: "expenses.slotOutcomeWheelDetail",
  gift: "expenses.slotOutcomeGiftDetail",
  duel: "expenses.slotOutcomeDuelDetail",
  ghost: "expenses.slotOutcomeGhostDetail",
  bombs: "expenses.slotOutcomeBombsDetail",
  jackpot: "expenses.slotOutcomeJackpotDetail",
};

/** Short, shouty versions for the stamp and the LED panel. */
export const OUTCOME_SHORT: Record<SlotOutcomeKind, TranslationKey> = {
  miss: "expenses.slotStampMiss",
  pair: "expenses.slotStampPair",
  lemons: "expenses.slotStampLemons",
  cherries: "expenses.slotStampCherries",
  bells: "expenses.slotStampBells",
  stars: "expenses.slotStampStars",
  clover: "expenses.slotStampClover",
  receipt: "expenses.slotStampReceipt",
  wheel: "expenses.slotStampWheel",
  gift: "expenses.slotStampGift",
  duel: "expenses.slotStampDuel",
  ghost: "expenses.slotStampGhost",
  bombs: "expenses.slotStampBombs",
  jackpot: "expenses.slotStampJackpot",
};

const PRIZE_ICON: Record<SlotPrize, string> = {
  othersPay2: "💸",
  pay3: "😬",
  shield: "🛡️",
  freeSpins: "🍒",
  boost: "⚡",
};

const PRIZE_LABEL: Record<SlotPrize, TranslationKey> = {
  othersPay2: "expenses.slotPrizeOthersPay2",
  pay3: "expenses.slotPrizePay3",
  shield: "expenses.slotPrizeShield",
  freeSpins: "expenses.slotPrizeFreeSpins",
  boost: "expenses.slotPrizeBoost",
};

export function usePrizeFace(): (prize: SlotPrize) => PrizeFace {
  const t = useT();
  return (prize) => ({ icon: PRIZE_ICON[prize], label: t(PRIZE_LABEL[prize]) });
}

export type SymbolState = "idle" | "win" | "dim";

/**
 * One reel row. A symbol that is part of a combination pulses and glows, the
 * way a slot animates the symbols on the line that paid; the others dim so
 * the combination reads at a glance. A mystery symbol shows a ❓ until
 * `mystery` turns false, then turns over onto the real one.
 */
export function ReelSymbol({
  symbol,
  state,
  glow,
  mystery = false,
  flipIn = false,
}: {
  symbol: SlotSymbol;
  state: SymbolState;
  glow: string;
  mystery?: boolean;
  /** Turn over onto the symbol as it mounts: a mystery symbol being revealed. */
  flipIn?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ height: ROW_HEIGHT }}>
      <motion.span
        className="block"
        style={{ filter: state === "win" ? `drop-shadow(0 0 8px ${glow})` : undefined }}
        animate={
          state === "win" && !reduceMotion
            ? { scale: [1, 1.28, 1.08, 1.22, 1.1], rotate: [0, -6, 4, -2, 0] }
            : { scale: 1, rotate: 0, opacity: state === "dim" ? 0.3 : 1 }
        }
        transition={
          state === "win" && !reduceMotion
            ? { duration: 1.1, ease: "easeInOut", repeat: 2, repeatType: "mirror" }
            : { duration: 0.25 }
        }
      >
        {mystery ? (
          <span className="flex size-12 items-center justify-center rounded-lg bg-[linear-gradient(135deg,oklch(0.55_0.2_300),oklch(0.45_0.2_270))] text-3xl font-black text-white shadow-[0_0_12px_oklch(0.6_0.22_300/0.7)]">
            ?
          </span>
        ) : (
          <motion.span
            className="block"
            initial={flipIn && !reduceMotion ? { rotateY: 90, scale: 1.3 } : false}
            animate={{ rotateY: 0, scale: 1 }}
            transition={{ duration: 0.35 }}
          >
            <SlotSymbolFace symbol={symbol} className="text-[40px]" />
          </motion.span>
        )}
      </motion.span>
    </span>
  );
}

export function FacesRow({
  faces,
  className,
}: {
  faces: readonly SlotSymbol[];
  className?: string;
}) {
  return (
    <span className={cn("flex items-center justify-center gap-1", className)}>
      {faces.map((face, index) => (
        <SlotSymbolFace key={index} symbol={face} className="text-xl" />
      ))}
    </span>
  );
}

export function WildBadge() {
  const t = useT();
  return (
    <span className="rounded-full bg-[oklch(0.5_0.22_300)] px-2 py-0.5 text-xs font-black tracking-wide text-white shadow-[0_0_12px_oklch(0.6_0.22_300/0.7)]">
      {t("expenses.slotWildBadge")}
    </span>
  );
}

/** The combinations and what they do, with their real odds — nothing about this machine is hidden. */
export function Paytable({ className }: { className?: string }) {
  const t = useT();
  const rows = [...SLOT_PAYTABLE].reverse();
  return (
    <details className={cn("group rounded-xl border", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">📜</span>
          {t("expenses.slotPaytableTitle")}
        </span>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform duration-(--duration-fast) group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <ul className="flex flex-col gap-1 px-2.5 pb-2.5">
        {rows.map((entry) => (
          <li key={entry.kind} className="flex items-center gap-2.5 text-xs">
            <span aria-hidden="true" className="flex w-16 shrink-0 justify-center">
              {entry.symbol ? (
                <FacesRow faces={[entry.symbol, entry.symbol, entry.symbol]} />
              ) : entry.kind === "pair" ? (
                <FacesRow faces={["cherry", "cherry"]} className="opacity-80" />
              ) : (
                <span className="text-muted-foreground text-base">—</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{t(OUTCOME_TITLE[entry.kind])}</span>{" "}
              <span className="text-muted-foreground">{t(OUTCOME_DETAIL[entry.kind])}</span>
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {Math.round((entry.weight / SLOT_TOTAL_WEIGHT) * 100)} %
            </span>
          </li>
        ))}
      </ul>
      <ul className="text-muted-foreground flex flex-col gap-1.5 border-t px-2.5 py-2.5 text-xs">
        <li>{t("expenses.slotPaytableWild")}</li>
        <li>{t("expenses.slotPaytableJackpot")}</li>
        <li>{t("expenses.slotPaytableCoins")}</li>
        <li>{t("expenses.slotPaytableMulti")}</li>
        <li>{t("expenses.slotPaytableHold")}</li>
        <li>{t("expenses.slotPaytableRisk")}</li>
        <li>{t("expenses.slotPaytablePity")}</li>
      </ul>
    </details>
  );
}

/** Hot or cold, a shield and a boost: the little badges next to a person. */
export function PlayerBadges({ game, uid }: { game: SlotGameState; uid: string }) {
  const reduceMotion = useReducedMotion();
  const streak = game.streaks[uid] ?? 0;
  const boost = game.boost?.uid === uid ? game.boost.spinsLeft : 0;
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5 text-sm">
      {streak >= 3 && (
        <motion.span
          className="block"
          animate={reduceMotion ? undefined : { scale: [1, 1.25, 1], rotate: [0, -6, 6, 0] }}
          transition={{ duration: 0.7, repeat: Infinity }}
        >
          🔥
        </motion.span>
      )}
      {streak <= -3 && (
        <motion.span
          className="block"
          animate={reduceMotion ? undefined : { y: [0, -2, 0] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          🌧️
        </motion.span>
      )}
      {game.shields.includes(uid) && <span>🛡️</span>}
      {boost > 0 && (
        <span className="rounded-full bg-[oklch(0.84_0.16_85)] px-1 text-[10px] font-black text-[oklch(0.3_0.07_60)]">
          ⚡×2·{boost}
        </span>
      )}
    </span>
  );
}

/** Running "who owes how much so far" breakdown — both the live mid-game state and the final result use this. */
export function TallyList({
  game,
  members,
  currency,
}: {
  game: SlotGameState;
  members: Record<string, GroupMember>;
  currency: string;
}) {
  const t = useT();
  const entries = Object.entries(game.tallies)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0 && game.out.length === 0) {
    return (
      <p className="text-muted-foreground text-center text-xs">{t("expenses.slotTallyEmpty")}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([uid, amount]) => (
        <li
          key={uid}
          className="animate-rise flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <GameAvatar name={members[uid].displayName} className="size-7 shrink-0 text-xs" />
            <span className="truncate">{members[uid].displayName}</span>
            <PlayerBadges game={game} uid={uid} />
          </span>
          <AnimatedMoney
            amountMinor={amount}
            currency={currency}
            className="shrink-0 text-base font-semibold"
          />
        </li>
      ))}
      {game.out.map((uid) => (
        <li
          key={uid}
          className="animate-rise border-primary/30 bg-primary/5 flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <GameAvatar name={members[uid].displayName} className="size-7 shrink-0 text-xs" />
            <span className="truncate">{members[uid].displayName}</span>
          </span>
          <span className="text-primary shrink-0 text-xs font-semibold">
            {t("expenses.slotOutBadge")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What the award show needs to know beyond the final tallies. */
export interface SlotStats {
  /** The single biggest charge anyone took in one go. */
  biggestHit: { uid: string; amountMinor: number } | null;
  /** How often each person pressed Risiko. */
  risks: Record<string, number>;
  /** Who hit the jackpot. */
  jackpots: string[];
}

export const EMPTY_SLOT_STATS: SlotStats = { biggestHit: null, risks: {}, jackpots: [] };

interface Award {
  id: string;
  icon: string;
  title: string;
  uid: string;
  detail: string;
}

/**
 * The award show once the bill is allocated: Glückspilz, Pechvogel, the
 * hardest single hit, the Risiko king and the jackpot heroes, each on a card
 * with the person's avatar, dealt in one after another under a confetti
 * burst.
 */
export function SlotAwards({
  game,
  stats,
  members,
  currency,
}: {
  game: SlotGameState;
  stats: SlotStats;
  members: Record<string, GroupMember>;
  currency: string;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const name = (uid: string) => members[uid]?.displayName ?? "?";
  const money = (minor: number) => formatMoney(minor, currency);

  const owed = game.seats.map((uid) => ({ uid, amount: game.tallies[uid] ?? 0 }));
  const sorted = [...owed].sort((a, b) => a.amount - b.amount);
  const awards: Award[] = [];
  const lucky = sorted[0];
  const unlucky = sorted[sorted.length - 1];
  if (lucky) {
    awards.push({
      id: "lucky",
      icon: "🍀",
      title: t("expenses.slotAwardLucky"),
      uid: lucky.uid,
      detail: t("expenses.slotAwardLuckyDetail", { amount: money(lucky.amount) }),
    });
  }
  if (unlucky && unlucky.uid !== lucky?.uid) {
    awards.push({
      id: "unlucky",
      icon: "🌧️",
      title: t("expenses.slotAwardUnlucky"),
      uid: unlucky.uid,
      detail: t("expenses.slotAwardUnluckyDetail", { amount: money(unlucky.amount) }),
    });
  }
  if (stats.biggestHit) {
    awards.push({
      id: "hit",
      icon: "💥",
      title: t("expenses.slotAwardHardestHit"),
      uid: stats.biggestHit.uid,
      detail: t("expenses.slotAwardHardestHitDetail", {
        amount: money(stats.biggestHit.amountMinor),
      }),
    });
  }
  const riskKing = Object.entries(stats.risks).sort((a, b) => b[1] - a[1])[0];
  if (riskKing && riskKing[1] > 0) {
    awards.push({
      id: "risk",
      icon: "🎲",
      title: t("expenses.slotAwardRisk"),
      uid: riskKing[0],
      detail: t("expenses.slotAwardRiskDetail", { count: riskKing[1] }),
    });
  }
  for (const uid of stats.jackpots) {
    awards.push({
      id: `jackpot-${uid}`,
      icon: "7️⃣",
      title: t("expenses.slotAwardJackpot"),
      uid,
      detail: t("expenses.slotAwardJackpotDetail"),
    });
  }

  // One burst when the show opens; a seed fixed at mount keeps the confetti
  // from re-rolling on re-renders.
  const [seed] = useState(() => game.spins * 31 + game.seats.length);

  return (
    <section className="flex flex-col gap-2">
      <span ref={anchorRef} className="text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t("expenses.slotAwardsTitle")}
      </span>
      <div className="grid grid-cols-2 gap-2">
        {awards.map((award, index) => (
          <motion.div
            key={award.id}
            className="flex flex-col items-center gap-1 rounded-xl border bg-[linear-gradient(180deg,oklch(0.84_0.16_85/0.14),transparent)] p-3 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 18, rotate: index % 2 ? 4 : -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.15 + index * 0.18, type: "spring", stiffness: 300, damping: 18 }}
          >
            <span aria-hidden="true" className="text-2xl">
              {award.icon}
            </span>
            <span className="text-[11px] font-bold tracking-wide uppercase">{award.title}</span>
            <GameAvatar name={name(award.uid)} className="size-9 text-sm" />
            <span className="max-w-full truncate text-sm font-semibold">{name(award.uid)}</span>
            <span className="text-muted-foreground text-xs">{award.detail}</span>
          </motion.div>
        ))}
      </div>
      <ConfettiBurst
        anchorRef={anchorRef}
        seed={seed}
        colors={celebrationColors(game.seats.map(name))}
        count={60}
        power={1.2}
        delay={0.2}
      />
    </section>
  );
}
