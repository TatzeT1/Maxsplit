"use client";

import { motion, useAnimate, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { memberInk, memberPalette } from "@/lib/games/member-colors";
import { cn, nameHash } from "@/lib/utils";

/*
 * The split mini-games' shared celebration: a receipt slip, a rubber stamp,
 * and paper confetti in the caught person's own colors.
 *
 * Why this vocabulary and not the gold-on-black one it replaced: a "who pays"
 * reveal is the app's core beat, money landing on a person, and the app
 * already has a way of saying that. `SaveCelebration` calls it "a receipt
 * being stamped". The games use that same metaphor, just louder: a till slip
 * drops in, a stamp slams down on it, the screen jolts from the impact, and
 * confetti flies up. Nothing here is gold, neon, or a coin. Every color comes
 * from the person's avatar gradient, so the moment belongs to *them* rather
 * than to a generic prize.
 *
 * On confetti: `SaveCelebration` dropped confetti on purpose ("confetti is a
 * birthday; this is a receipt being stamped"). That's the right call for
 * saving an expense. These games are the one place in the app that *is* the
 * birthday, a party game played by passing a phone around, so they get
 * both: the stamp, and the confetti.
 *
 * Every beat keys off one clock. The slip lands, then the stamp hits at
 * `STAMP_IMPACT_S`, and the shake, rings, bloom, ink splatter, confetti and
 * the thump in `playStampSound` all fire on that same frame. Fired at
 * scattered times the same effects read as noise. On one beat they read as
 * a single physical hit.
 */

/** When the stamp starts falling, in seconds after the flash mounts. */
const STAMP_DROP_S = 0.12;
/** How long the stamp's fall-and-settle takes. The impact is halfway through. */
const STAMP_DURATION_S = 0.36;
/** The frame the stamp hits the paper. Everything with weight keys off this one beat. */
export const STAMP_IMPACT_S = STAMP_DROP_S + STAMP_DURATION_S * 0.5;
/** How long a `CatchFlash` holds before its caller clears it. Long enough for the confetti to land. */
export const CATCH_FLASH_HOLD_MS = 1650;

/**
 * `useLayoutEffect` on the client, `useEffect` on the server, as in
 * `AnimatedMoney`. The confetti origin has to be positioned before the first
 * paint, or the burst visibly starts from the page's top-left corner.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Tiny seeded PRNG (mulberry32). Confetti trajectories are pure decoration,
 * but they're computed during render, so they must be a pure function of
 * their inputs. A re-render mid-burst then reproduces the same arcs instead
 * of teleporting every piece.
 */
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

interface ConfettiPiece {
  peakX: number;
  peakY: number;
  endX: number;
  endY: number;
  spin: number;
  flip: number;
  duration: number;
  delay: number;
  width: number;
  height: number;
  radius: string;
  color: string;
}

function makeConfetti(
  seed: number,
  count: number,
  colors: string[],
  power: number,
): ConfettiPiece[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => {
    // Mostly an upward fan, with a few pieces in every direction, so it reads
    // as a burst from a point rather than a fountain.
    const angle = random() < 0.78 ? -Math.PI / 2 + (random() - 0.5) * 2.3 : random() * Math.PI * 2;
    const speed = (130 + random() * 230) * power;
    const peakX = Math.cos(angle) * speed;
    const peakY = Math.sin(angle) * speed;
    const shape = random();
    // Paper, not glitter: flat rectangles, dots and the odd streamer.
    const [width, height, radius] =
      shape < 0.55
        ? [7 + random() * 5, 4 + random() * 2.5, "1.5px"]
        : shape < 0.8
          ? [6 + random() * 3, 6 + random() * 3, "50%"]
          : [3, 11 + random() * 6, "1.5px"];
    return {
      peakX,
      peakY,
      endX: peakX * 1.35 + (random() - 0.5) * 90,
      endY: peakY + 240 + random() * 280,
      spin: (random() - 0.5) * 1100,
      flip: 0.35 + random() * 0.4,
      duration: 1.05 + random() * 0.4,
      delay: random() * 0.07,
      width,
      height,
      radius,
      color: colors[Math.floor(random() * colors.length)],
    };
  });
}

/**
 * Colors for a burst celebrating these people: each person's avatar
 * gradient (twice, so they dominate), plus a sprinkle of the app's own
 * accent inks so a single-person burst isn't monochrome.
 */
export function celebrationColors(names: string[]): string[] {
  const personal = names.flatMap((name) => {
    const [from, to] = memberPalette(name);
    return [from, to, from, to];
  });
  return [...personal, "var(--primary)", "var(--chart-2)", "var(--chart-3)"];
}

/**
 * A one-shot burst of paper confetti from the center of `anchorRef`.
 *
 * Rendered into `document.body` as a fixed, full-viewport layer above the
 * dialog, which is what lets it fly past the dialog's edges. Rendered inside
 * the dialog, it would either be clipped to the card or, worse, extend the
 * dialog's `overflow-y-auto` scroll area for as long as pieces are in the
 * air. It unmounts itself once the last piece has landed, and renders nothing
 * at all under `prefers-reduced-motion`.
 */
export function ConfettiBurst({
  anchorRef,
  seed,
  colors,
  count = 44,
  power = 1,
  delay = 0,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  seed: number;
  colors: string[];
  count?: number;
  /** Multiplies how far pieces fly. The finale uses more. */
  power?: number;
  /** Seconds before the burst fires, to land it on an impact frame. */
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const originRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(false);
  // Keyed by value, not array identity, so callers can pass a fresh array
  // every render without re-rolling the trajectories.
  const colorKey = colors.join("|");
  const pieces = useMemo(
    () => makeConfetti(seed, count, colorKey.split("|"), power),
    [seed, count, colorKey, power],
  );

  useIsomorphicLayoutEffect(() => {
    const anchor = anchorRef.current;
    const origin = originRef.current;
    if (!anchor || !origin) return;
    const rect = anchor.getBoundingClientRect();
    origin.style.left = `${rect.left + rect.width / 2}px`;
    origin.style.top = `${rect.top + rect.height / 2}px`;
  }, [anchorRef, reduceMotion]);

  useEffect(() => {
    const timeout = setTimeout(() => setLanded(true), (delay + 1.6) * 1000);
    return () => clearTimeout(timeout);
  }, [delay]);

  if (reduceMotion || landed || typeof document === "undefined") return null;

  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <div ref={originRef} className="absolute size-0">
        {pieces.map((piece, index) => {
          const timing = { delay: delay + piece.delay, duration: piece.duration };
          return (
            <motion.span
              key={index}
              className="absolute block"
              style={{
                width: piece.width,
                height: piece.height,
                left: -piece.width / 2,
                top: -piece.height / 2,
                borderRadius: piece.radius,
                backgroundColor: piece.color,
              }}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0, rotateX: 0 }}
              animate={{
                // Starts at 0, not 1: opacity runs on the Web Animations API
                // with backwards fill, so a first keyframe of 1 would show
                // every piece sitting still at the origin for the whole delay.
                opacity: [0, 1, 1, 0],
                x: [0, piece.peakX, piece.endX],
                y: [0, piece.peakY, piece.endY],
                rotate: [0, piece.spin * 0.4, piece.spin],
                rotateX: [0, 360],
              }}
              transition={{
                // Up fast and decelerating, then falling and accelerating: a
                // two-segment curve is all the "physics" a half-second arc needs.
                x: { ...timing, times: [0, 0.3, 1], ease: ["easeOut", "easeOut"] },
                y: { ...timing, times: [0, 0.3, 1], ease: ["easeOut", "easeIn"] },
                rotate: { ...timing, times: [0, 0.3, 1], ease: "linear" },
                opacity: { ...timing, times: [0, 0.03, 0.72, 1], ease: "linear" },
                // A flat piece of paper tumbling end over end. Without
                // perspective, rotateX renders as a cosine squash, which is
                // exactly what a flipping sheet looks like from the front.
                rotateX: {
                  delay: timing.delay,
                  duration: piece.flip,
                  repeat: Infinity,
                  ease: "linear",
                },
              }}
            />
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The jolt of a stamp landing, applied to whatever element `ref` is attached
 * to. Returned as a hook rather than baked into `CatchFlash` because the
 * thing that should shake is the caller's whole play area, not the overlay.
 * Fires on the impact frame by default, and does nothing under reduced motion.
 */
export function useImpactShake<T extends HTMLElement = HTMLDivElement>() {
  const [scope, animate] = useAnimate<T>();
  const reduceMotion = useReducedMotion();

  const shake = useCallback(
    (strength = 1, delay = STAMP_IMPACT_S) => {
      if (reduceMotion || !scope.current) return;
      const s = strength;
      animate(
        scope.current,
        {
          x: [0, -9 * s, 8 * s, -5 * s, 3 * s, -1 * s, 0],
          y: [0, 5 * s, -3 * s, 2 * s, -1 * s, 0, 0],
          rotate: [0, -0.8 * s, 0.6 * s, -0.35 * s, 0.15 * s, 0, 0],
        },
        { delay, duration: 0.5, ease: "easeOut" },
      );
    },
    [animate, reduceMotion, scope],
  );

  return [scope, shake] as const;
}

/**
 * A rubber stamp in the person's own ink, slamming down from above: big and
 * faint while it falls toward the "camera", solid and slightly
 * over-squashed on contact, then settled at a jaunty angle. Positioned
 * entirely by the caller's `className`.
 */
export function InkStamp({
  label,
  name,
  size = "lg",
  delay = STAMP_DROP_S,
  className,
}: {
  label: string;
  /** Whose ink: the stamp is printed in this person's color. */
  name: string;
  size?: "sm" | "lg";
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const ink = memberInk(name);
  const splatter = useMemo(() => {
    const random = seededRandom(nameHash(name) ^ label.length);
    return Array.from({ length: 6 }, () => ({
      left: `${random() < 0.5 ? -4 - random() * 12 : 100 + random() * 12}%`,
      top: `${random() * 100}%`,
      size: 2 + random() * 4,
    }));
  }, [name, label]);
  const impactDelay = delay + STAMP_DURATION_S * 0.5;

  return (
    <motion.span
      aria-hidden="true"
      // The blend lives on the root, not the ink: the root's transform makes it
      // a stacking context, and a blend mode only ever mixes with what's
      // behind it *inside* its stacking context. On the inner span it would
      // multiply against nothing. Multiply is what makes ink sit *in* the
      // paper; in the dark theme it would just vanish, so it's light-only.
      className={cn(
        "pointer-events-none block mix-blend-multiply dark:mix-blend-normal",
        className,
      )}
      initial={reduceMotion ? { opacity: 0, rotate: -12 } : { opacity: 0, scale: 2.6, rotate: -28 }}
      animate={
        reduceMotion
          ? { opacity: 1, rotate: -12 }
          : {
              opacity: [0, 1, 1, 1],
              scale: [2.6, 0.84, 1.07, 1],
              rotate: [-28, -8, -13, -12],
            }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              delay,
              duration: STAMP_DURATION_S,
              times: [0, 0.5, 0.75, 1],
              ease: ["easeIn", "easeOut", "easeInOut"],
            }
      }
    >
      <span
        className={cn(
          "stamp-ink relative block",
          size === "lg" ? "rounded-lg border-[3px] p-[3px]" : "rounded-md border-2 p-0.5",
        )}
        style={{ borderColor: ink, color: ink }}
      >
        <span
          className={cn(
            "font-heading block border font-black tracking-wide whitespace-nowrap uppercase [font-variation-settings:'SOFT'_100,'WONK'_1]",
            size === "lg"
              ? "rounded-[5px] px-2.5 py-0.5 text-xl"
              : "rounded-[3px] px-1.5 text-[11px] leading-5",
          )}
          style={{ borderColor: ink }}
        >
          {label}
        </span>
      </span>
      {!reduceMotion &&
        splatter.map((drop, index) => (
          <motion.span
            key={index}
            className="absolute block rounded-full"
            style={{
              left: drop.left,
              top: drop.top,
              width: drop.size,
              height: drop.size,
              backgroundColor: ink,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.4, 1], opacity: [0, 0.9, 0.75] }}
            transition={{ delay: impactDelay, duration: 0.28, ease: "easeOut" }}
          />
        ))}
    </motion.span>
  );
}

/**
 * The full "caught!" takeover shared by the wheel, slot machine and scratch
 * cards: a warm paper scrim (the lottery's `bg-popover` takeover, not a dark
 * one), a till slip with the person on it dropping in, the stamp slamming
 * onto the slip, a bloom and two rings in their colors, and a confetti burst.
 *
 * Mount it inside `AnimatePresence` keyed by a fresh id per catch, in a
 * `relative` container it should cover, and clear it after
 * `CATCH_FLASH_HOLD_MS`. Pair it with `useImpactShake` on the play area and
 * `playStampSound(STAMP_IMPACT_S)` so sound, shake and stamp land together.
 */
export function CatchFlash({
  seed,
  name,
  stampLabel,
  caption,
  finale = false,
  className,
}: {
  /** Distinct per catch: seeds the confetti and prints the slip number. */
  seed: number;
  name: string;
  stampLabel: string;
  /** What's printed below the tear line: an amount, a verdict, a count. */
  caption?: ReactNode;
  /** The round's last catch: more confetti, thrown harder. */
  finale?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [from, to] = memberPalette(name);
  const impactMs = `${Math.round(STAMP_IMPACT_S * 1000)}ms`;

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : 0.12 } }}
      exit={{
        opacity: 0,
        transition: reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.4, 0, 1, 1] },
      }}
      className={cn(
        "pointer-events-none absolute z-30 flex items-center justify-center overflow-hidden",
        // By default it covers a play area inside the dialog's padding, which
        // has no visible edge of its own: bleed out to the dialog's edges
        // rather than drawing rounded corners that leave the corner content
        // poking out undimmed. Pass `inset-0 rounded-xl` to cover the dialog.
        className ?? "-inset-x-4 -inset-y-2",
      )}
    >
      <span className="bg-popover/85 absolute inset-0 backdrop-blur-[2px]" />
      <span
        className="animate-bloom absolute size-52 rounded-full blur-2xl"
        style={{ backgroundColor: from, animationDelay: impactMs }}
      />
      <span
        className="animate-settle-ring absolute size-44 rounded-full border-2"
        style={{ borderColor: from, animationDelay: impactMs }}
      />
      <span
        className="animate-settle-ring absolute size-44 rounded-full border"
        style={{ borderColor: to, animationDelay: `${Math.round(STAMP_IMPACT_S * 1000) + 150}ms` }}
      />
      <span ref={anchorRef} className="absolute size-px" />

      {/* The slip drops in first, then takes the stamp's hit: a small squash on the impact frame. */}
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -64, rotate: -8 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, rotate: -2 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 380, damping: 17, mass: 0.8 }
        }
        className="paper-tokens relative"
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, 7, 0], scaleY: [1, 0.96, 1] }}
          transition={{ delay: STAMP_IMPACT_S, duration: 0.34, ease: "easeOut" }}
          // Fixed ink-colored shadow, not `--foreground`: in the dark theme that
          // token is cream, and the slip would glow instead of casting a shadow.
          className="drop-shadow-[0_12px_18px_oklch(0.2_0.05_250/0.35)]"
        >
          <div className="receipt-edges bg-card flex w-60 max-w-[70vw] flex-col items-center gap-1.5 px-5 pt-6 pb-7 text-center">
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.3em]">
              #{String(seed).padStart(3, "0")}
            </span>
            <span
              className="animate-laugh-land relative mt-1 block rounded-full"
              style={{ animationDelay: impactMs }}
            >
              <GameAvatar name={name} className="ring-card shadow-e2 size-16 text-2xl ring-4" />
            </span>
            <span className="font-heading max-w-full truncate text-2xl leading-tight font-medium">
              {name}
            </span>
            {caption && (
              <>
                <span className="border-foreground/20 my-1 w-full border-t-2 border-dashed" />
                {caption}
              </>
            )}
          </div>
        </motion.div>
        {/* Always on cream paper here, so the ink multiplies in both themes. */}
        <InkStamp
          label={stampLabel}
          name={name}
          className="absolute -top-5 -right-7 z-10 dark:mix-blend-multiply"
        />
      </motion.div>

      <ConfettiBurst
        anchorRef={anchorRef}
        seed={seed * 7919 + nameHash(name)}
        colors={celebrationColors([name])}
        count={finale ? 76 : 46}
        power={finale ? 1.35 : 1}
        delay={STAMP_IMPACT_S}
      />
    </motion.div>
  );
}
