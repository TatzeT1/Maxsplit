"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { formatMoney } from "@/lib/format/money";
import { createPortal } from "react-dom";
import { SLOT_SYMBOL_EMOJI, type SlotSymbol } from "@/lib/games/slot-machine";
import { cn } from "@/lib/utils";

/*
 * The slot machine's own effects, on top of the shared stamp-and-confetti
 * celebration (`celebration.tsx`), modelled on how online slots present a
 * win: the winning symbols light up and a line is drawn through them, the
 * win comes in tiers ("Big Win", "Mega Win", "Jackpot") on a rotating
 * sunburst while the amount rolls up, coins fountain out of the machine,
 * amounts float up as bubbles, and an LED panel on the cabinet shows the
 * stake, the spin count and the last result. Everything here is decoration
 * over a result the game module already settled; the motion all stops under
 * reduced motion.
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
  if (symbol === "wild") {
    // The wild carries its name, the way every slot labels its wild: a gem
    // alone could pass for just another fruit.
    return (
      <span className={cn("relative inline-flex justify-center leading-none", className)}>
        💎
        <span className="absolute -bottom-[0.15em] rounded-[3px] bg-[oklch(0.5_0.22_300)] px-[0.15em] py-[0.02em] text-[0.24em] leading-none font-black tracking-wider text-white shadow-sm">
          WILD
        </span>
      </span>
    );
  }
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
  /** `burst`: out of the anchor in every direction. `fountain`: a long upward stream, like a payout tray overflowing. `rain`: down from the top of the screen. */
  mode?: "burst" | "fountain" | "rain";
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
    if (anchor && mode !== "rain") {
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
      const fountain = mode === "fountain";
      const angle = -Math.PI / 2 + (random() - 0.5) * (fountain ? 1.3 : 2.6);
      const speed = fountain ? 280 + random() * 300 : 140 + random() * 200;
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
        duration: fountain ? 1.3 + random() * 0.5 : 1.1 + random() * 0.4,
        delay: fountain ? random() * 1.4 : random() * 0.08,
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

/** Gold for wins, a hot red for the combinations that cost the spinner. */
export const WIN_GOLD = "oklch(0.84 0.16 85)";
export const LOSS_RED = "oklch(0.64 0.22 25)";

/**
 * The payline lighting up: a glowing line drawn left to right through the
 * landed row, then pulsing, the way a slot traces the line that paid.
 * Positioned by the caller over the reels, `rowTop`/`rowHeight` being the
 * payline row inside that box.
 */
export function WinLine({
  rowTop,
  rowHeight,
  color,
}: {
  rowTop: number;
  rowHeight: number;
  color: string;
}) {
  const reduceMotion = useReducedMotion();
  const y = rowTop + rowHeight / 2;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible"
      preserveAspectRatio="none"
    >
      <motion.line
        x1="2%"
        x2="98%"
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color})` }}
        initial={{ pathLength: reduceMotion ? 1 : 0, opacity: 0.95 }}
        animate={
          reduceMotion
            ? { pathLength: 1, opacity: 0.9 }
            : { pathLength: 1, opacity: [0.95, 0.95, 0.45, 0.95, 0.45, 0.95] }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                pathLength: { duration: 0.35, ease: "easeOut" },
                opacity: { duration: 1.8, times: [0, 0.2, 0.4, 0.6, 0.8, 1], ease: "linear" },
              }
        }
      />
    </svg>
  );
}

/**
 * Rotating light rays behind a big win, the "sunburst" every slot puts
 * behind its win banner. A repeating conic gradient, masked to fade out
 * toward the edges, turning slowly.
 */
export function Sunburst({
  color,
  className,
  reverse = false,
}: {
  color: string;
  className?: string;
  /** Turn the other way: a second, counter-rotating layer reads as shimmer. */
  reverse?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className={cn("pointer-events-none absolute block rounded-full", className)}
      style={{
        background: `repeating-conic-gradient(from 0deg, ${color} 0deg 9deg, transparent 9deg 22.5deg)`,
        maskImage: "radial-gradient(circle, black 18%, transparent 68%)",
        WebkitMaskImage: "radial-gradient(circle, black 18%, transparent 68%)",
      }}
      initial={{ rotate: 0, scale: reduceMotion ? 1 : 0.3, opacity: 0 }}
      animate={
        reduceMotion ? { opacity: 0.45 } : { rotate: reverse ? -360 : 360, scale: 1, opacity: 0.55 }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              rotate: { duration: 9, repeat: Infinity, ease: "linear" },
              scale: { type: "spring", stiffness: 160, damping: 14 },
              opacity: { duration: 0.3 },
            }
      }
    />
  );
}

/**
 * An amount that rolls up from zero like a slot's win meter, over
 * `duration` seconds. Rendered from a motion value, so the count doesn't
 * re-render the banner sixty times a second.
 */
export function RollupMoney({
  amountMinor,
  currency,
  duration,
  delay = 0,
  prefix = "",
  className,
}: {
  amountMinor: number;
  currency: string;
  duration: number;
  delay?: number;
  prefix?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const value = useMotionValue(reduceMotion ? amountMinor : 0);
  const text = useTransform(value, (minor) => prefix + formatMoney(Math.round(minor), currency));

  useEffect(() => {
    if (reduceMotion) {
      value.set(amountMinor);
      return;
    }
    const controls = animate(value, amountMinor, { duration, delay, ease: [0.2, 0.6, 0.35, 1] });
    return () => controls.stop();
  }, [amountMinor, delay, duration, reduceMotion, value]);

  return <motion.span className={cn("tabular-money", className)}>{text}</motion.span>;
}

export type WinTier = "win" | "big" | "mega" | "freeSpins" | "jackpot";

/**
 * The win takeover for the combinations that are good news for the person
 * at the machine: a tier title in gold that punches in over a rotating
 * sunburst, the person, the combination, and whatever follows from it (an
 * amount rolling up, a list, a count of free spins). Tap anywhere to skip.
 *
 * Mount it inside `AnimatePresence`, in a `relative` container it should
 * cover, the same way as `CatchFlash`.
 */
export function SlotWinBanner({
  tierLabel,
  tier,
  name,
  faces,
  tone = "gold",
  children,
  onDismiss,
}: {
  tierLabel: string;
  tier: WinTier;
  name: string;
  faces: readonly SlotSymbol[];
  /** Gold for good news for the person at the machine, red for an event that costs the table. */
  tone?: "gold" | "red";
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const huge = tier === "jackpot" || tier === "mega";
  const red = tone === "red";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : 0.15 } }}
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.25 } }}
      onClick={onDismiss}
      className="absolute -inset-x-4 -inset-y-2 z-30 flex cursor-pointer items-center justify-center overflow-hidden"
    >
      <span
        className={cn(
          "absolute inset-0",
          red
            ? "bg-[radial-gradient(circle_at_50%_45%,oklch(0.34_0.12_25/0.93),oklch(0.14_0.03_260/0.95)_70%)]"
            : "bg-[radial-gradient(circle_at_50%_45%,oklch(0.32_0.09_70/0.92),oklch(0.14_0.03_260/0.94)_70%)]",
        )}
      />
      <Sunburst
        color={red ? "oklch(0.7 0.2 30 / 0.45)" : "oklch(0.88 0.15 88 / 0.55)"}
        className="size-[150vmax]"
      />
      {huge && <Sunburst color="oklch(0.75 0.18 40 / 0.35)" className="size-[110vmax]" reverse />}
      <AmbientBubbles count={huge ? 26 : 16} className="absolute inset-0" />

      <div className="relative flex w-full max-w-80 flex-col items-center gap-3 px-6 text-center">
        <motion.span
          className={cn(
            "font-heading block bg-clip-text leading-none font-black tracking-tight text-transparent uppercase [font-variation-settings:'SOFT'_100,'WONK'_1]",
            red
              ? "bg-[linear-gradient(180deg,oklch(0.96_0.06_60),oklch(0.75_0.19_40)_45%,oklch(0.5_0.2_25)_55%,oklch(0.85_0.15_45))]"
              : "bg-[linear-gradient(180deg,oklch(0.97_0.08_95),oklch(0.85_0.17_85)_45%,oklch(0.62_0.15_60)_55%,oklch(0.9_0.13_90))]",
            "drop-shadow-[0_0_18px_oklch(0.85_0.17_85/0.7)] drop-shadow-[0_3px_0_oklch(0.4_0.1_50)]",
            // Long titles ("Geistertausch") step down so they still fit a phone.
            tierLabel.length > 11
              ? "text-[34px]"
              : tierLabel.length > 8
                ? "text-[40px]"
                : huge
                  ? "text-[54px]"
                  : "text-[44px]",
          )}
          initial={reduceMotion ? false : { scale: 0.2, rotate: -8, opacity: 0 }}
          animate={
            reduceMotion
              ? { opacity: 1 }
              : { scale: [0.2, 1.25, 0.95, 1.05, 1], rotate: [-8, 3, -1, 0, 0], opacity: 1 }
          }
          transition={reduceMotion ? { duration: 0 } : { duration: 0.75, ease: "easeOut" }}
        >
          {tierLabel}
        </motion.span>

        <motion.span
          className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 ring-1 ring-[oklch(0.85_0.17_85/0.6)]"
          initial={reduceMotion ? false : { y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.35 }}
        >
          {faces.map((face, index) => (
            <motion.span
              key={index}
              className="block"
              animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
              transition={{
                delay: 0.5 + index * 0.12,
                duration: 0.5,
                repeat: Infinity,
                repeatDelay: 0.9,
              }}
            >
              <SlotSymbolFace symbol={face} className="text-2xl" />
            </motion.span>
          ))}
        </motion.span>

        <motion.span
          className="flex items-center gap-2 text-white"
          initial={reduceMotion ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.45 }}
        >
          <GameAvatar name={name} className="size-8 text-sm ring-2 ring-white/80" />
          <span className="font-heading max-w-48 truncate text-xl font-semibold">{name}</span>
        </motion.span>

        <motion.div
          className="flex w-full flex-col items-center gap-1.5 text-white"
          initial={reduceMotion ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.55 }}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Bubbles drifting up: champagne in a win banner, and the fizz inside the
 * cabinet while free spins are running. Positions are seeded so a re-render
 * doesn't reshuffle them mid-rise.
 */
export function AmbientBubbles({
  count,
  className,
  color = "oklch(0.95 0.06 90 / 0.55)",
}: {
  count: number;
  className?: string;
  color?: string;
}) {
  const reduceMotion = useReducedMotion();
  const bubbles = useMemo(() => {
    const random = seededRandom(count * 7349);
    return Array.from({ length: count }, () => ({
      left: random() * 100,
      size: 4 + random() * 10,
      duration: 2.2 + random() * 2.4,
      delay: random() * 2.5,
      drift: (random() - 0.5) * 30,
    }));
  }, [count]);
  if (reduceMotion) return null;
  return (
    <span aria-hidden="true" className={cn("pointer-events-none overflow-hidden", className)}>
      {bubbles.map((bubble, index) => (
        <motion.span
          key={index}
          className="absolute bottom-0 block rounded-full"
          style={{
            left: `${bubble.left}%`,
            width: bubble.size,
            height: bubble.size,
            border: `1.5px solid ${color}`,
            background: `radial-gradient(circle at 30% 30%, ${color}, transparent 60%)`,
          }}
          initial={{ y: 20, x: 0, opacity: 0 }}
          animate={{ y: "-110%", x: bubble.drift, opacity: [0, 1, 1, 0] }}
          transition={{
            duration: bubble.duration,
            delay: bubble.delay,
            repeat: Infinity,
            ease: "easeOut",
            opacity: {
              duration: bubble.duration,
              delay: bubble.delay,
              repeat: Infinity,
              times: [0, 0.1, 0.75, 1],
            },
          }}
        />
      ))}
    </span>
  );
}

export interface FloatBubble {
  id: string;
  label: string;
  tone: "win" | "loss";
}

/**
 * Amounts floating up off the machine as bubbles after a pull: "+2,50 €
 * Max" for every charge, "Einsatz zurück" for a pair. They rise, wobble and
 * fade on their own; the caller just swaps the list.
 */
export function FloatingBubbles({ bubbles }: { bubbles: FloatBubble[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex flex-col items-center"
    >
      <AnimatePresence>
        {bubbles.map((bubble, index) => (
          <motion.span
            key={bubble.id}
            className={cn(
              "absolute block rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap shadow-lg ring-2",
              bubble.tone === "win"
                ? "bg-[oklch(0.95_0.07_92)] text-[oklch(0.38_0.09_70)] ring-[oklch(0.84_0.16_85)]"
                : "bg-[oklch(0.97_0.02_25)] text-[oklch(0.45_0.17_25)] ring-[oklch(0.64_0.22_25)]",
            )}
            style={{ marginLeft: (index - (bubbles.length - 1) / 2) * 24 }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.4 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : {
                    opacity: [0, 1, 1, 0],
                    y: [30, -10 - index * 34, -60 - index * 34, -110 - index * 34],
                    scale: [0.4, 1.1, 1, 0.95],
                    x: [0, 6, -6, 0],
                  }
            }
            exit={{ opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0.2 }
                : { duration: 2.2, delay: index * 0.18, times: [0, 0.18, 0.7, 1], ease: "easeOut" }
            }
          >
            {bubble.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

/**
 * The cabinet's LED panel: amber digits on a dark glass strip, like the
 * BET / WIN / CREDIT meters on a real machine. Each cell is a label over a
 * value; a `blink` cell flashes, for a fresh win.
 */
export function LedPanel({
  cells,
}: {
  cells: { label: string; value: ReactNode; blink?: boolean; tone?: "win" | "loss" }[];
}) {
  const reduceMotion = useReducedMotion();
  return (
    // `w-0 min-w-full`: as wide as the reels below it, never wider. A long
    // value truncates instead of stretching the cabinet sideways mid-game.
    <div className="relative grid w-0 min-w-full grid-cols-3 gap-px overflow-hidden rounded-md bg-[oklch(0.3_0.03_60)] ring-1 ring-black/40">
      {cells.map((cell, index) => (
        <div
          key={index}
          className="flex min-w-0 flex-col items-center bg-[oklch(0.16_0.02_40)] px-1 py-1"
        >
          <span className="text-[8px] font-semibold tracking-[0.14em] text-[oklch(0.7_0.08_60)] uppercase">
            {cell.label}
          </span>
          <motion.span
            key={String(cell.blink)}
            className={cn(
              "max-w-full truncate font-mono text-[12px] leading-tight font-bold tracking-tight tabular-nums",
              cell.tone === "loss" ? "text-[oklch(0.7_0.2_25)]" : "text-[oklch(0.86_0.16_80)]",
            )}
            style={{ textShadow: "0 0 6px currentColor" }}
            animate={cell.blink && !reduceMotion ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
            transition={
              cell.blink && !reduceMotion
                ? { duration: 0.5, repeat: 5, ease: "easeInOut" }
                : { duration: 0.2 }
            }
          >
            {cell.value}
          </motion.span>
        </div>
      ))}
    </div>
  );
}

/**
 * A coin on the reels during free spins, with its value printed on it. It
 * pops in as its reel stops, then flies up into the pot on the LED panel.
 */
export function CoinChip({ multiplier, collect }: { multiplier: number; collect: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className="flex size-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,oklch(0.97_0.08_95),oklch(0.82_0.16_80)_55%,oklch(0.62_0.14_65))] text-sm font-black text-[oklch(0.35_0.08_60)] shadow-[0_0_14px_oklch(0.84_0.16_85/0.8)] ring-2 ring-[oklch(0.6_0.13_65)]"
      initial={reduceMotion ? false : { scale: 0, rotate: -90 }}
      animate={
        collect && !reduceMotion
          ? { scale: [1, 1.25, 0.4], y: [0, -10, -140], opacity: [1, 1, 0], rotate: 0 }
          : { scale: 1, rotate: 0 }
      }
      transition={
        collect && !reduceMotion
          ? { duration: 0.75, times: [0, 0.25, 1], ease: "easeIn" }
          : { type: "spring", stiffness: 420, damping: 14 }
      }
    >
      {multiplier}×
    </motion.span>
  );
}

/**
 * The Risiko coin flip: a big coin spinning on a dark scrim, landing on a
 * tick (the loss is struck off) or ×2 (it doubles). `won` is decided before
 * this mounts; the spin only reveals it.
 */
export function GambleFlip({
  won,
  title,
  stakeLabel,
  resultLabel,
}: {
  won: boolean;
  title: string;
  stakeLabel: string;
  resultLabel: string;
}) {
  const reduceMotion = useReducedMotion();
  const spinTurns = 6;
  const finalRotation = spinTurns * 360 + (won ? 0 : 180);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute -inset-x-4 -inset-y-2 z-40 flex flex-col items-center justify-center gap-4 overflow-hidden bg-[oklch(0.14_0.03_260/0.92)] text-white"
    >
      <span className="font-heading text-4xl font-black tracking-tight text-[oklch(0.88_0.15_85)] uppercase drop-shadow-[0_0_14px_oklch(0.85_0.17_85/0.7)]">
        {title}
      </span>
      <span className="text-sm text-white/80">{stakeLabel}</span>
      <span className="[perspective:600px]">
        <motion.span
          className="relative block size-32 [transform-style:preserve-3d]"
          initial={{ rotateY: 0 }}
          animate={{ rotateY: reduceMotion ? (won ? 0 : 180) : finalRotation }}
          transition={reduceMotion ? { duration: 0 } : { duration: 1.4, ease: [0.2, 0.7, 0.3, 1] }}
        >
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,oklch(0.9_0.15_150),oklch(0.6_0.17_150))] text-6xl font-black text-white shadow-[0_0_30px_oklch(0.7_0.17_150/0.7)] ring-4 ring-white/70 [backface-visibility:hidden]">
            ✓
          </span>
          <span className="absolute inset-0 flex [transform:rotateY(180deg)] items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,oklch(0.8_0.18_30),oklch(0.5_0.2_25))] text-5xl font-black text-white shadow-[0_0_30px_oklch(0.64_0.22_25/0.7)] ring-4 ring-white/70 [backface-visibility:hidden]">
            ×2
          </span>
        </motion.span>
      </span>
      <motion.span
        className={cn(
          "font-heading text-3xl font-black",
          won ? "text-[oklch(0.85_0.17_150)]" : "text-[oklch(0.72_0.2_28)]",
        )}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: [0.5, 1.2, 1] }}
        transition={{ delay: reduceMotion ? 0 : 1.45, duration: 0.4 }}
      >
        {resultLabel}
      </motion.span>
    </motion.div>
  );
}
