"use client";

import { motion, useReducedMotion } from "motion/react";
import { Flag } from "lucide-react";
import { useLocale, useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { assignPinLanes, layoutNumberLine } from "@/lib/games/estimate-axis";
import { formatEstimateValue } from "@/lib/games/estimate-input";
import { cn } from "@/lib/utils";
import type { EstimatePublicQuestion, EstimateReveal } from "@/lib/types";

/** Which part of the reveal is on the line: the guesses only, plus the truth, or everything (the ranking is the parent's). */
export type EstimateLineStep = "pins" | "truth" | "all";

/** Pins drop in this far apart (ms): at most 350, and a crowd of 32 still lands within 3 s. */
export function pinDropGapMs(pinCount: number): number {
  return Math.min(350, 3000 / Math.max(pinCount, 1));
}

/** The track is inset by this much on each side, so a pin or label at 0 or 1 never leaves the card (px, = `mx-7`). */
const TRACK_INSET_PX = 28;
/** One lane of stacked pins: name label, avatar and a stem down to the track. */
const LANE_PX = 44;
const LABEL_PX = 14;
const PIN_PX = 24;
/** A pin label is about 56 px wide on a 280 px track (assignPinLanes: "about 0.2"). */
const PIN_MIN_GAP = 0.2;
/** Tick labels closer than this share of the track are left out (the marks stay). */
const TICK_LABEL_MIN_GAP = 0.2;
/** Axis: the tick row under the track. */
const TICK_ROW_PX = 26;

/**
 * The reveal's number line: a log track for ratio questions, linear for
 * intervals (`layoutNumberLine`, display math only), one pin per contender who
 * guessed (initial in the member's colour + name label, stacked into lanes when
 * near each other), then — at step "truth"/"all" — the truth as a full-height
 * line with a flag and the tolerance band as a pale stripe around it.
 *
 * The whole thing is `aria-hidden`: the ranking `<ol>` next to it carries the
 * same information in reading order. Colour is never the only carrier: pins
 * have initials AND a printed name, the truth is a flag glyph on a solid line,
 * "you" gets a heavier ring and a bold label. At step "pins" the truth is not
 * rendered at all — no pin, no text, no data attribute. Players without a guess
 * are not pinned (the ranking says "kein Tipp").
 *
 * `names` maps uid -> display name; its KEY ORDER is the drop order of the pins
 * (pass the round's seat order). Under reduced motion everything appears at once.
 */
export function EstimateNumberLine({
  question,
  reveal,
  names,
  currentUid,
  step,
}: {
  question: EstimatePublicQuestion;
  reveal: EstimateReveal;
  names: Record<string, string>;
  currentUid?: string;
  step: EstimateLineStep;
}) {
  const t = useT();
  const { locale } = useLocale();
  const reduceMotion = useReducedMotion();

  const order = Object.keys(names);
  const orderOf = (uid: string) => {
    const index = order.indexOf(uid);
    return index === -1 ? order.length : index;
  };
  const guesses = reveal.results
    .flatMap((row) => (row.guessMilli === null ? [] : [{ uid: row.uid, milli: row.guessMilli }]))
    .sort((a, b) => orderOf(a.uid) - orderOf(b.uid));

  const layout = layoutNumberLine({
    scale: question.scale,
    bounds: question.bounds,
    truthMilli: reveal.truthMilli,
    guessesMilli: guesses.map((guess) => guess.milli),
    format: question.format,
  });
  const pins = guesses.map((guess) => ({
    id: guess.uid,
    milli: guess.milli,
    position: layout.position(guess.milli),
  }));
  const lanes = assignPinLanes(pins, PIN_MIN_GAP);
  const laneCount = pins.length === 0 ? 1 : Math.max(...pins.map((pin) => lanes[pin.id])) + 1;
  const trackTop = laneCount * LANE_PX;
  const height = trackTop + TICK_ROW_PX;
  const gapS = pinDropGapMs(pins.length) / 1000;
  const showTruth = step !== "pins";

  const truthAt = layout.position(reveal.truthMilli);
  let band: { left: number; width: number } | null = null;
  if (showTruth && reveal.tolerance !== null) {
    const half =
      reveal.tolerance.kind === "interval"
        ? reveal.tolerance.milli
        : (reveal.truthMilli * reveal.tolerance.permille) / 1000;
    const from = layout.position(Math.max(0, reveal.truthMilli - half));
    const to = layout.position(reveal.truthMilli + half);
    band = { left: from, width: Math.max(to - from, 0) };
  }

  const ticks: { milli: number; position: number; labelled: boolean }[] = [];
  for (const tick of layout.ticks) {
    const previous = ticks.findLast((other) => other.labelled);
    ticks.push({
      ...tick,
      labelled: previous === undefined || tick.position - previous.position >= TICK_LABEL_MIN_GAP,
    });
  }

  const pct = (position: number) => `${(position * 100).toFixed(3)}%`;

  return (
    <div
      aria-hidden="true"
      data-slot="estimate-number-line"
      data-scale={layout.scale}
      className="flex flex-col gap-1"
    >
      <div style={{ marginInline: TRACK_INSET_PX }} className="relative">
        <div style={{ height }} className="relative">
          {band && (
            <span
              data-slot="estimate-tolerance-band"
              className="bg-primary/10 absolute top-0 rounded-sm"
              style={{ left: pct(band.left), width: `max(${pct(band.width)}, 4px)`, height }}
            />
          )}
          <span
            className="bg-border absolute inset-x-0 h-0.5 rounded-full"
            style={{ top: trackTop }}
          />
          {ticks.map((tick) => (
            <span
              key={tick.milli}
              className="absolute"
              style={{ left: pct(tick.position), top: trackTop, transform: "translateX(-50%)" }}
            >
              <span className="bg-border mx-auto block h-1.5 w-px" />
              {tick.labelled && (
                <span className="text-muted-foreground tabular-money block pt-0.5 text-center text-[10px] leading-none whitespace-nowrap">
                  {formatEstimateValue(tick.milli, locale, {
                    grouping: question.format !== "year",
                  })}
                </span>
              )}
            </span>
          ))}

          {pins.map((pin, index) => {
            const lane = lanes[pin.id];
            const top = (laneCount - 1 - lane) * LANE_PX;
            const name = names[pin.id] ?? "?";
            const you = pin.id === currentUid;
            return (
              <span key={pin.id}>
                <span
                  className="bg-foreground/25 absolute w-px"
                  style={{
                    left: pct(pin.position),
                    top: top + LABEL_PX + PIN_PX,
                    height: trackTop - (top + LABEL_PX + PIN_PX),
                  }}
                />
                <motion.span
                  data-slot="estimate-pin"
                  data-uid={pin.id}
                  className="absolute z-20 flex flex-col items-center gap-0"
                  style={{ left: pct(pin.position), top, x: "-50%" }}
                  initial={reduceMotion ? false : { opacity: 0, y: -14, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 22, delay: index * gapS }
                  }
                >
                  <span
                    className={cn(
                      "max-w-14 truncate text-[11px] leading-[14px]",
                      you ? "font-bold" : "font-medium",
                    )}
                    style={{ height: LABEL_PX }}
                  >
                    {name}
                  </span>
                  <GameAvatar
                    name={name}
                    className={cn(
                      "ring-card size-6 text-xs ring-2",
                      you && "ring-foreground ring-offset-0",
                    )}
                  />
                </motion.span>
              </span>
            );
          })}

          {showTruth && (
            <motion.span
              data-slot="estimate-truth-pin"
              className="absolute top-0 z-10 flex flex-col items-center"
              style={{ left: pct(truthAt), height: trackTop + 6, x: "-50%" }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 16 }
              }
            >
              <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
                <Flag className="size-3" />
              </span>
              <span className="bg-primary w-0.5 flex-1" />
            </motion.span>
          )}
        </div>
      </div>
      {layout.scale === "ratio" && (
        <span className="text-muted-foreground self-end pr-7 text-[10px] leading-none">
          {t("expenses.estimateAxisLog")}
        </span>
      )}
    </div>
  );
}
