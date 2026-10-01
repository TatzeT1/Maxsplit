"use client";

import { motion, useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SLOT_SYMBOL_EMOJI, type SlotSymbol } from "@/lib/games/slot-machine";
import { cn } from "@/lib/utils";

/*
 * The slot machine's own effects, on top of the shared stamp-and-confetti
 * celebration (`celebration.tsx`): the paytable symbols themselves flying out
 * of the reels, a rain of coins for the jackpot, the bomb's flash, and the
 * bulbs around the housing. Everything here is decoration over a result the
 * game module already settled, and renders nothing under reduced motion.
 */

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Same mulberry32 as the confetti: trajectories must be a pure function of the seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A symbol on a reel. Sevens are set as a big red numeral in the heading
 * face rather than the keycap emoji, which reads as a button, not a slot
 * machine seven.
 */
export function SlotSymbolFace({ symbol, className }: { symbol: SlotSymbol; className?: string }) {
  if (symbol === "seven") {
    return (
      <span
        className={cn(
          "font-heading leading-none font-black text-[oklch(0.56_0.21_25)] [font-variation-settings:'SOFT'_100,'WONK'_1]",
          className,
        )}
      >
        7
      </span>
    );
  }
  return <span className={cn("leading-none", className)}>{SLOT_SYMBOL_EMOJI[symbol]}</span>;
}

interface ShowerPiece {
  startX: number;
  startY: number;
  peakX: number;
  peakY: number;
  endX: number;
  endY: number;
  spin: number;
  size: number;
  duration: number;
  delay: number;
  glyph: string;
}

/**
 * Glyphs flying out of a point (`burst`) or falling from the top of the
 * screen (`rain`). Portaled to `document.body` as a fixed layer like
 * `ConfettiBurst`, so pieces can fly past the dialog's edges without
 * stretching its scroll area, and unmounted once the last one has landed.
 */
export function EmojiShower({
  anchorRef,
  seed,
  glyphs,
  mode = "burst",
  count = 18,
  delay = 0,
}: {
  anchorRef?: RefObject<HTMLElement | null>;
  seed: number;
  glyphs: string[];
  mode?: "burst" | "rain";
  count?: number;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const originRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(false);
  const glyphKey = glyphs.join("|");
  // Read once, on mount: a rain that re-rolls on resize mid-fall would teleport every coin.
  const [viewport] = useState(() =>
    typeof window === "undefined"
      ? { width: 400, height: 800 }
      : { width: window.innerWidth, height: window.innerHeight },
  );

  useIsomorphicLayoutEffect(() => {
    const origin = originRef.current;
    const anchor = anchorRef?.current;
    if (!origin) return;
    if (anchor && mode === "burst") {
      const rect = anchor.getBoundingClientRect();
      origin.style.left = `${rect.left + rect.width / 2}px`;
      origin.style.top = `${rect.top + rect.height / 2}px`;
    } else {
      origin.style.left = "0px";
      origin.style.top = "0px";
    }
  }, [anchorRef, mode, reduceMotion]);

  const pieces = useMemo<ShowerPiece[]>(() => {
    const random = seededRandom(seed);
    const list = glyphKey.split("|");
    return Array.from({ length: count }, () => {
      const glyph = list[Math.floor(random() * list.length)];
      if (mode === "rain") {
        const x = random() * viewport.width;
        return {
          startX: x,
          startY: -60,
          peakX: x + (random() - 0.5) * 60,
          peakY: viewport.height * 0.45,
          endX: x + (random() - 0.5) * 120,
          endY: viewport.height + 60,
          spin: (random() - 0.5) * 720,
          size: 22 + random() * 18,
          duration: 1.4 + random() * 0.9,
          delay: random() * 1.6,
          glyph,
        };
      }
      const angle = -Math.PI / 2 + (random() - 0.5) * 2.6;
      const speed = 140 + random() * 200;
      const peakX = Math.cos(angle) * speed;
      const peakY = Math.sin(angle) * speed;
      return {
        startX: 0,
        startY: 0,
        peakX,
        peakY,
        endX: peakX * 1.4 + (random() - 0.5) * 80,
        endY: peakY + 320 + random() * 260,
        spin: (random() - 0.5) * 540,
        size: 24 + random() * 16,
        duration: 1.1 + random() * 0.4,
        delay: random() * 0.08,
        glyph,
      };
    });
  }, [seed, glyphKey, count, mode, viewport.width, viewport.height]);

  useEffect(() => {
    const longest = pieces.reduce((max, piece) => Math.max(max, piece.delay + piece.duration), 0);
    const timeout = setTimeout(() => setLanded(true), (delay + longest + 0.1) * 1000);
    return () => clearTimeout(timeout);
  }, [delay, pieces]);

  if (reduceMotion || landed || typeof document === "undefined") return null;

  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[61] overflow-hidden">
      <div ref={originRef} className="absolute size-0">
        {pieces.map((piece, index) => {
          const timing = { delay: delay + piece.delay, duration: piece.duration };
          return (
            <motion.span
              key={index}
              className="absolute block leading-none select-none"
              style={{ fontSize: piece.size, left: -piece.size / 2, top: -piece.size / 2 }}
              initial={{ opacity: 0, x: piece.startX, y: piece.startY, rotate: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                x: [piece.startX, piece.peakX, piece.endX],
                y: [piece.startY, piece.peakY, piece.endY],
                rotate: [0, piece.spin * 0.4, piece.spin],
              }}
              transition={{
                x: { ...timing, times: [0, 0.32, 1], ease: ["easeOut", "easeOut"] },
                y: {
                  ...timing,
                  times: [0, 0.32, 1],
                  ease: mode === "rain" ? ["easeIn", "linear"] : ["easeOut", "easeIn"],
                },
                rotate: { ...timing, times: [0, 0.32, 1], ease: "linear" },
                opacity: { ...timing, times: [0, 0.04, 0.8, 1], ease: "linear" },
              }}
            >
              {piece.glyph}
            </motion.span>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

/** The bomb going off: a hot white-orange flash over the whole play area. */
export function BombFlash({ delay = 0 }: { delay?: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-4 -inset-y-2 z-40 bg-[radial-gradient(circle,oklch(0.98_0.05_90)_0%,oklch(0.8_0.17_55)_55%,oklch(0.55_0.2_30)_100%)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.95, 0.5, 0] }}
      transition={{ delay, duration: 0.55, times: [0, 0.08, 0.3, 1], ease: "easeOut" }}
    />
  );
}

export type BulbMode = "idle" | "chase" | "party";

/**
 * A row of marquee bulbs for the housing. Idle they glow softly; while the
 * reels spin a light chases along them; after a big win every bulb blinks.
 * Under reduced motion they just stay lit.
 */
export function BulbRow({ count, mode }: { count: number; mode: BulbMode }) {
  const reduceMotion = useReducedMotion();
  return (
    <span aria-hidden="true" className="flex items-center justify-between px-1">
      {Array.from({ length: count }, (_, index) => {
        const color = index % 2 === 0 ? "var(--primary)" : "var(--chart-3)";
        const animated = !reduceMotion && mode !== "idle";
        return (
          <motion.span
            key={`${mode}-${index}`}
            className="block size-1.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
            initial={false}
            animate={
              animated
                ? { opacity: mode === "chase" ? [0.25, 1, 0.25] : [1, 0.2, 1] }
                : { opacity: mode === "idle" ? 0.45 : 1 }
            }
            transition={
              animated
                ? {
                    duration: mode === "chase" ? 0.6 : 0.36,
                    repeat: Infinity,
                    delay: mode === "chase" ? (index / count) * 0.6 : (index % 2) * 0.18,
                    ease: "easeInOut",
                  }
                : { duration: 0.2 }
            }
          />
        );
      })}
    </span>
  );
}
