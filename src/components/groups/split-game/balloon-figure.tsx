"use client";

import { motion, useReducedMotion } from "motion/react";
import { springs } from "@/lib/motion";

/** How full the balloon looks, 0..1 — the share of the most air it could ever take. Never the secret burst point. */
function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

type Mood = "calm" | "uneasy" | "panic";

function moodFor(grown: number): Mood {
  if (grown < 0.45) return "calm";
  if (grown < 0.72) return "uneasy";
  return "panic";
}

/**
 * The balloon, drawn as one SVG that grows with `fullness` and whose face gets
 * more nervous as it fills. It is built only from how much air went in — the
 * burst point is secret, so nothing here (size, wobble, face) can depend on
 * it. `color` is whoever is holding it, so the balloon changes colour as it
 * is passed round.
 */
export function BalloonFigure({ fullness, color }: { fullness: number; color: string }) {
  const reduceMotion = useReducedMotion();
  // The burst range is wide, so the raw air share barely moves on the first
  // pumps; the square root makes every early pump visibly count.
  const grown = Math.sqrt(clamp01(fullness));
  const scale = 0.42 + 0.58 * grown;
  const mood = moodFor(grown);
  const wobble = 0.6 + grown * 3.4;

  return (
    <motion.div
      aria-hidden="true"
      className="mx-auto h-[250px] w-[192px]"
      style={{ transformOrigin: "50% 94%" }}
      animate={reduceMotion ? { scale } : { scale, rotate: [-wobble, wobble, -wobble] }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              scale: { ...springs.snappy, stiffness: 380, damping: 14 },
              rotate: { repeat: Infinity, duration: 1.7 - grown * 0.9, ease: "easeInOut" },
            }
      }
    >
      <svg viewBox="0 0 200 260" className="size-full overflow-visible">
        {/* string */}
        <path
          d="M100 198 C 90 214 110 228 98 250"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.45}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* knot */}
        <path d="M91 185 L109 185 L114 199 L86 199 Z" fill={color} />
        <path d="M91 185 L109 185 L114 199 L86 199 Z" fill="#000" fillOpacity={0.18} />
        {/* body */}
        <path
          d="M100 22 C 152 22 174 66 170 108 C 166 152 130 186 100 190 C 70 186 34 152 30 108 C 26 66 48 22 100 22 Z"
          fill={color}
        />
        {/* shade on the lower right, shine on the upper left */}
        <path
          d="M170 108 C 166 152 130 186 100 190 C 130 172 158 140 160 96 C 162 76 154 52 138 38 C 160 52 172 82 170 108 Z"
          fill="#000"
          fillOpacity={0.14}
        />
        <ellipse
          cx={66}
          cy={64}
          rx={13}
          ry={24}
          transform="rotate(28 66 64)"
          fill="#fff"
          fillOpacity={0.42}
        />
        <Face mood={mood} />
      </svg>
    </motion.div>
  );
}

function Face({ mood }: { mood: Mood }) {
  const ink = "#3b2417";
  if (mood === "calm") {
    return (
      <g>
        <ellipse cx={78} cy={100} rx={7} ry={9} fill="#fff" />
        <ellipse cx={122} cy={100} rx={7} ry={9} fill="#fff" />
        <circle cx={79} cy={102} r={4} fill={ink} />
        <circle cx={121} cy={102} r={4} fill={ink} />
        <path
          d="M82 128 Q100 144 118 128"
          fill="none"
          stroke={ink}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <ellipse cx={66} cy={122} rx={8} ry={5} fill="#ff6f91" fillOpacity={0.45} />
        <ellipse cx={134} cy={122} rx={8} ry={5} fill="#ff6f91" fillOpacity={0.45} />
      </g>
    );
  }
  if (mood === "uneasy") {
    return (
      <g>
        <path d="M68 84 L88 90" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <path d="M132 84 L112 90" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <ellipse cx={78} cy={104} rx={8} ry={10} fill="#fff" />
        <ellipse cx={122} cy={104} rx={8} ry={10} fill="#fff" />
        <circle cx={80} cy={106} r={4.5} fill={ink} />
        <circle cx={120} cy={106} r={4.5} fill={ink} />
        <path
          d="M84 134 Q92 126 100 134 Q108 142 116 134"
          fill="none"
          stroke={ink}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <path d="M150 78 Q156 92 150 98 Q144 92 150 78 Z" fill="#8fd4ff" />
      </g>
    );
  }
  return (
    <g>
      <path d="M66 80 L90 90" stroke={ink} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M134 80 L110 90" stroke={ink} strokeWidth={4.5} strokeLinecap="round" />
      <ellipse cx={78} cy={106} rx={11} ry={13} fill="#fff" />
      <ellipse cx={122} cy={106} rx={11} ry={13} fill="#fff" />
      <circle cx={78} cy={107} r={3.5} fill={ink} />
      <circle cx={122} cy={107} r={3.5} fill={ink} />
      <ellipse cx={100} cy={138} rx={12} ry={15} fill={ink} />
      <ellipse cx={100} cy={143} rx={7} ry={7} fill="#ff6f91" />
      <path d="M152 76 Q159 93 152 100 Q145 93 152 76 Z" fill="#8fd4ff" />
      <path d="M46 92 Q40 104 46 110 Q52 104 46 92 Z" fill="#8fd4ff" />
      <path
        d="M170 60 l10 -6 M176 76 l12 -2 M28 60 l-10 -6 M24 78 l-12 -2"
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </g>
  );
}

const SHARDS = 12;

/**
 * The bang: a ring of torn-rubber shards flying outwards from the middle of
 * the stage. Purely decoration — it shows nothing the game state doesn't
 * already say — so it renders nothing under reduced motion.
 */
export function PopBurst({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {Array.from({ length: SHARDS }, (_, index) => {
        const angle = (index / SHARDS) * Math.PI * 2 + (index % 2 === 0 ? 0.12 : -0.1);
        const distance = 70 + (index % 3) * 22;
        return (
          <motion.span
            key={index}
            className="absolute block h-4 w-3"
            style={{
              backgroundColor: color,
              clipPath: "polygon(50% 0, 0 100%, 100% 100%)",
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: angle * 57 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              opacity: 0,
              scale: 1.5,
              rotate: angle * 57 + (index % 2 === 0 ? 240 : -240),
            }}
            transition={{ duration: 0.75, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
