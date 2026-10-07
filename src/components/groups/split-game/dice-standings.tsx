"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Check } from "lucide-react";
import { useLocale, useT } from "@/components/locale-provider";
import { DiceFace } from "@/components/groups/split-game/dice-figure";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import {
  diceKind,
  diceNumber,
  latestDiceRoll,
  type DiceGame,
  type DicePair,
  type DiceSeat,
  type DiceStanding,
} from "@/lib/games/dice-cup";
import type { Locale, TranslationKey } from "@/lib/i18n/translate";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

/*
 * The Würfelbecher's live table. After every roll the list re-sorts by
 * `diceStanding` — most at risk on top, right under the felt where a phone
 * shows it without scrolling — with a red "Zahlzone" line under whoever would
 * pay if the round ended now. Each of them holds a 🧾, which hops off one row
 * and onto the next as a roll hands the bill on. Below the line: who is still
 * to roll, then the safe, ticked off the moment they are (being above the line
 * is final, see `dice-cup.ts`).
 *
 * Rows move with `layout="position"` on the precise spring (they slide, they
 * don't overshoot); under reduced motion they reorder instantly. The list
 * isn't tappable, so a row moving under a finger can't cause a mis-tap.
 */

/** How long a "Gerettet!" bubble floats over a row before it has faded out by itself. */
const SAVED_BUBBLE_S = 1.6;

/** A roll as the people at the table say it: "54", "66 · Pasch", "21 · Mäxchen!". */
export function RollTag({ pair, showKind = true }: { pair: DicePair; showKind?: boolean }) {
  const t = useT();
  const kind = diceKind(pair);
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-heading tabular-money text-lg leading-none font-medium">
        {diceNumber(pair)}
      </span>
      {showKind && kind !== "plain" && (
        <span className="text-muted-foreground text-xs font-medium">
          {kind === "maexchen" ? t("expenses.diceMaexchen") : t("expenses.dicePasch")}
        </span>
      )}
    </span>
  );
}

function joinNames(locale: Locale, names: string[]): string {
  return new Intl.ListFormat(locale === "de" ? "de-DE" : "en-GB", {
    type: "conjunction",
  }).format(names);
}

/**
 * "Am Zug: Ben — Schlag die 42 von Lea!", with the roll to beat as dice beside
 * it. The line is read the way the table reads rolls, because they are ranked,
 * not counted: the line can be a Pasch ("Schlag den 3er-Pasch von Lea!",
 * although 33 is a smaller number than 65), and nothing beats a Mäxchen, so
 * against one it says so rather than suggesting that 21 is easy to top. Before
 * enough people have rolled to fill the zone there is nothing to beat yet.
 */
export function DiceTurnBanner({
  uid,
  game,
  standing,
  members,
}: {
  uid: string;
  game: DiceGame;
  standing: DiceStanding;
  members: Record<string, GroupMember>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const target = standing.target;
  let hint: string;
  if (Object.keys(game.rolls).length === 0) hint = t("expenses.diceHint");
  else if (!target) hint = t("expenses.diceZoneOpen");
  else {
    const names = joinNames(
      locale,
      target.holders.map((holder) => members[holder].displayName),
    );
    const kind = diceKind(target.pair);
    hint =
      kind === "maexchen"
        ? t("expenses.diceTargetMaexchen")
        : kind === "pasch"
          ? t("expenses.diceTargetPasch", { face: target.pair[0], names })
          : t("expenses.diceTarget", { number: diceNumber(target.pair), names });
  }
  return (
    <DuelTurnBanner
      uid={uid}
      members={members}
      hint={hint}
      aside={target && <TargetChip key={diceNumber(target.pair)} pair={target.pair} />}
    />
  );
}

/** The roll to beat, as dice — the bigger die first, as it's read. Pops in afresh when the line moves. */
function TargetChip({ pair }: { pair: DicePair }) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const high = Math.max(pair[0], pair[1]);
  const low = Math.min(pair[0], pair[1]);
  return (
    <motion.span
      aria-hidden="true"
      className="border-destructive/30 bg-card flex shrink-0 flex-col items-center gap-1 rounded-lg border px-2 py-1.5"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.6, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 16 }}
    >
      <span className="text-destructive text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase">
        {/* "to beat" would be a lie over a Mäxchen: nothing does. */}
        {diceKind(pair) === "maexchen"
          ? t("expenses.diceMaexchen")
          : t("expenses.diceTargetEyebrow")}
      </span>
      <span className="flex gap-0.5">
        <DiceFace value={high} size={22} />
        <DiceFace value={low} size={22} />
      </span>
    </motion.span>
  );
}

/** Whose rows get a "Gerettet!" this roll; a new `id` per roll starts the bubble afresh. */
export interface DiceSavedNews {
  id: number;
  uids: readonly string[];
}

function inZone(seat: DiceSeat): boolean {
  return seat === "pays" || seat === "zone" || seat === "line";
}

export function DiceStandings({
  game,
  standing,
  members,
  activeUid,
  saved,
}: {
  game: DiceGame;
  standing: DiceStanding;
  members: Record<string, GroupMember>;
  /** Whoever is shaking the cup or up next: their row is ringed, to tie it to the banner. */
  activeUid: string | null;
  saved: DiceSavedNews | null;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const rollOff = game.rounds.length > 0 && game.contenders.length > 0;

  const rows = standing.order.map((uid) => (
    <DiceStandingRow
      key={uid}
      name={members[uid].displayName}
      pair={latestDiceRoll(game, uid)}
      seat={standing.seats[uid]}
      active={uid === activeUid}
      rollOff={rollOff}
      savedId={saved?.uids.includes(uid) ? saved.id : null}
      reduceMotion={reduceMotion}
    />
  ));
  rows.splice(
    standing.zoneSize,
    0,
    <ZoneLine key="zone-line" empty={standing.zoneSize === 0} reduceMotion={reduceMotion} />,
  );

  return <ul className="flex flex-col gap-1.5">{rows}</ul>;
}

/** The red line under the zone. It moves with the rows, so it always sits under the last of them. */
function ZoneLine({ empty, reduceMotion }: { empty: boolean; reduceMotion: boolean }) {
  const t = useT();
  return (
    <motion.li
      layout={reduceMotion ? false : "position"}
      transition={{ layout: springs.precise }}
      className="flex items-center gap-2 px-1"
    >
      <span aria-hidden="true" className="border-destructive/50 flex-1 border-t-2 border-dashed" />
      <span className="text-destructive flex items-center gap-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
        {!empty && <ArrowUp aria-hidden="true" className="size-3" strokeWidth={3} />}
        {empty ? t("expenses.diceZoneEmpty") : t("expenses.diceZoneLabel")}
      </span>
      <span aria-hidden="true" className="border-destructive/50 flex-1 border-t-2 border-dashed" />
    </motion.li>
  );
}

const SEAT_TAG: Partial<Record<DiceSeat, { key: TranslationKey; className: string }>> = {
  pays: { key: "expenses.dicePays", className: "text-destructive" },
  line: { key: "expenses.diceLineTag", className: "text-destructive" },
};

function DiceStandingRow({
  name,
  pair,
  seat,
  active,
  rollOff,
  savedId,
  reduceMotion,
}: {
  name: string;
  pair: DicePair | null;
  seat: DiceSeat;
  active: boolean;
  rollOff: boolean;
  savedId: number | null;
  reduceMotion: boolean;
}) {
  const t = useT();
  const kind = pair ? diceKind(pair) : "plain";
  const danger = inZone(seat);
  const tag = SEAT_TAG[seat];

  return (
    <motion.li
      layout={reduceMotion ? false : "position"}
      transition={{ layout: springs.precise }}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border p-2 transition-colors",
        danger ? "border-destructive/40 bg-destructive/5" : "bg-background",
        seat === "line" && "border-destructive/60 border-dashed",
        active && "ring-primary/40 ring-2",
      )}
    >
      <span className="relative shrink-0">
        <GameAvatar name={name} className="size-8 text-xs" />
        <AnimatePresence initial={false}>
          {danger && (
            // The bill. It drops onto whoever a roll pushes into the zone and
            // flies off whoever gets pushed out — both in the same instant, so
            // it reads as one slip hopping across.
            <motion.span
              key="receipt"
              aria-hidden="true"
              className="absolute -top-2.5 -right-3 text-lg leading-none drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)]"
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: -22, rotate: -35, scale: 0.6 }
              }
              animate={{ opacity: 1, y: 0, rotate: -10, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0 } }
                  : {
                      opacity: 0,
                      y: -20,
                      rotate: 25,
                      scale: 0.7,
                      transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                    }
              }
              transition={
                reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 14 }
              }
            >
              🧾
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {kind !== "plain" && (
          <span className="text-muted-foreground block text-xs font-medium">
            {kind === "maexchen" ? t("expenses.diceMaexchen") : t("expenses.dicePasch")}
          </span>
        )}
      </span>
      {/* A fixed-width column, so the dice line up from row to row. */}
      {pair ? (
        <span className="flex w-[5.5rem] shrink-0 items-center gap-2">
          <span className="flex gap-0.5" aria-hidden="true">
            <DiceFace value={pair[0]} size={24} />
            <DiceFace value={pair[1]} size={24} />
          </span>
          <RollTag pair={pair} showKind={false} />
        </span>
      ) : (
        <span className="text-muted-foreground w-[5.5rem] shrink-0 text-xs">
          {t("expenses.diceWaiting")}
        </span>
      )}
      <span className="flex w-16 shrink-0 justify-end text-xs font-semibold">
        {tag ? (
          <span className={tag.className}>{t(tag.key)}</span>
        ) : seat === "safe" ? (
          <motion.span
            key="safe"
            className="text-success flex items-center gap-0.5"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 15 }
            }
          >
            <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
            {t("expenses.diceSafe")}
          </motion.span>
        ) : seat === "waiting" && rollOff ? (
          <span className="text-primary">{t("expenses.diceTiedTag")}</span>
        ) : seat === "zone" ? (
          <span className="sr-only">{t("expenses.diceZoneLabel")}</span>
        ) : null}
      </span>
      {savedId !== null && <SavedBubble key={savedId} reduceMotion={reduceMotion} />}
    </motion.li>
  );
}

/** "Gerettet!": floats up off the row and fades out by itself — nothing to clear afterwards. */
function SavedBubble({ reduceMotion }: { reduceMotion: boolean }) {
  const t = useT();
  return (
    <motion.span
      aria-hidden="true"
      className="bg-success text-success-foreground shadow-e1 pointer-events-none absolute -top-3 right-2 z-10 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.8 }}
      animate={
        reduceMotion
          ? { opacity: [0, 1, 1, 0] }
          : { opacity: [0, 1, 1, 0], y: [6, -3, -5, -12], scale: [0.8, 1.08, 1, 1] }
      }
      transition={{ duration: SAVED_BUBBLE_S, times: [0, 0.12, 0.75, 1], ease: "easeOut" }}
    >
      {t("expenses.diceSaved")}
    </motion.span>
  );
}
