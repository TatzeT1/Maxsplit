"use client";

import { motion, useReducedMotion } from "motion/react";
import { useT } from "@/components/locale-provider";
import { DuckFigure } from "@/components/groups/split-game/duck-figure";
import { memberColor } from "@/lib/games/member-colors";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** The ducks' width in the print, in px. */
export const PRINT_DUCK_WIDTH = 34;
const PRINT_DUCK_HEIGHT = (PRINT_DUCK_WIDTH * 60) / 48;
/** The photo's height and the checkered band along its bottom, in px. */
const PHOTO_HEIGHT = 108;
const PHOTO_BAND = 20;
/** How far the safe duck's beak reaches over the line in the print. */
const PRINT_OVERLAP = 4;
/** How long the print takes to develop from a pale blank, in seconds. */
const DEVELOP_S = 1.1;

/**
 * The duck race's "Fotofinish": the frame the finish camera took when the
 * last duck to stay dry touched the line, printed as an instant photo. It
 * drops onto the water after the race and develops from a pale blank, and
 * stays there through the slips and the verdict until "Neu mischen" — the
 * table can lean over it and see that it really was a beak.
 *
 * Staging, like the race: it draws the two ducks the plan already decided
 * (`DuckRace.photo`), with the payer `gapPx` short of the line — the gap in
 * the frame, scaled to the print by the caller, never less than the eye
 * needs. A cream object in both themes (`paper-tokens`), like the slips. Under
 * reduced motion it is simply there.
 */
export function PhotoFinishPrint({
  safeName,
  payerName,
  gapPx,
  payerOnLeft,
  className,
}: {
  safeName: string;
  payerName: string;
  /** How far the payer's beak is behind the line, in print px. */
  gapPx: number;
  /** Their lanes' order on the course, kept in the print so the colours sit where they swam. */
  payerOnLeft: boolean;
  className?: string;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const lineY = PHOTO_HEIGHT - PHOTO_BAND;
  const safeTop = lineY + PRINT_OVERLAP - PRINT_DUCK_HEIGHT;
  const ducks = [
    { name: safeName, top: safeTop, payer: false },
    { name: payerName, top: safeTop - gapPx, payer: true },
  ];
  if (payerOnLeft) ducks.reverse();

  return (
    <motion.figure
      aria-hidden="true"
      initial={reduceMotion ? false : { opacity: 0, y: -40, rotate: -14 }}
      animate={{ opacity: 1, y: 0, rotate: -4 }}
      transition={reduceMotion ? { duration: 0 } : springs.weighted}
      // Fixed ink-coloured shadow, as on the slips: `--foreground` is cream in the dark theme.
      className={cn(
        "paper-tokens bg-card w-40 rounded-[3px] p-2 pb-0 drop-shadow-[0_10px_14px_oklch(0.2_0.05_250/0.35)]",
        className,
      )}
    >
      <div
        className="relative overflow-hidden rounded-[2px] bg-linear-to-b from-sky-300 to-sky-500"
        style={{ height: PHOTO_HEIGHT }}
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 10px 3px at 10px 8px, #fff 99%, transparent 100%), radial-gradient(ellipse 10px 3px at 30px 24px, #fff 99%, transparent 100%)",
            backgroundSize: "40px 34px",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: PHOTO_BAND,
            backgroundImage: "repeating-conic-gradient(#14110f 0% 25%, #ffffff 0% 50%)",
            backgroundSize: "12px 12px",
          }}
        />
        {/* The line itself, in the finish judge's red. */}
        <div className="absolute inset-x-0 h-0.5 bg-red-600" style={{ top: lineY - 1 }} />
        {ducks.map((duck, index) => (
          <div
            key={duck.payer ? "payer" : "safe"}
            data-print-duck={duck.payer ? "payer" : "safe"}
            className="absolute"
            style={{
              top: duck.top,
              left: `${index === 0 ? 30 : 70}%`,
              marginLeft: -PRINT_DUCK_WIDTH / 2,
            }}
          >
            <DuckFigure
              color={memberColor(duck.name)}
              initial={duck.name.charAt(0).toUpperCase() || "?"}
              size={PRINT_DUCK_WIDTH}
            />
            {duck.payer && (
              <span className="absolute -top-2 left-1/2 -ml-2 block w-4 text-center text-sm leading-none">
                🏮
              </span>
            )}
          </div>
        ))}
        {/* The print developing: a pale blank that fades as the colours come up. */}
        {!reduceMotion && (
          <motion.div
            className="absolute inset-0 bg-[oklch(0.93_0.02_85)]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: 0.2, duration: DEVELOP_S, ease: "easeIn" }}
          />
        )}
      </div>
      <figcaption className="flex flex-col items-center gap-px px-1 pt-1.5 pb-2.5 text-center">
        <span className="font-heading text-sm leading-tight font-semibold tracking-wide uppercase [font-variation-settings:'SOFT'_100,'WONK'_1]">
          {t("expenses.duckRacePhotoTitle")}
        </span>
        <span className="text-muted-foreground max-w-full truncate text-xs leading-tight">
          {t("expenses.duckRacePhotoCaption", { safe: safeName, payer: payerName })}
        </span>
      </figcaption>
    </motion.figure>
  );
}
