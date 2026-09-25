import { nameHash } from "@/lib/utils";

/**
 * Deterministic per-person colors for the split mini-games, indexed by the
 * same name hash as `avatarGradient` and in the same order as
 * `AVATAR_GRADIENTS` in `lib/utils.ts`, so a member's wheel wedge, reel chip,
 * confetti and ink stamp all read as the same color family as their avatar
 * everywhere else in the app.
 *
 * Each entry is the gradient's `[from, to]` pair as plain hex: canvas,
 * conic-gradient and inline styles can't use Tailwind classes, and the
 * celebration effects need both stops (confetti mixes them).
 */
const MEMBER_PALETTES: readonly (readonly [string, string])[] = [
  ["#fb923c", "#f43f5e"], // orange-400 → rose-500
  ["#2dd4bf", "#0ea5e9"], // teal-400 → sky-500
  ["#a78bfa", "#d946ef"], // violet-400 → fuchsia-500
  ["#fbbf24", "#f97316"], // amber-400 → orange-500
  ["#34d399", "#14b8a6"], // emerald-400 → teal-500
  ["#38bdf8", "#6366f1"], // sky-400 → indigo-500
  ["#f472b6", "#f43f5e"], // pink-400 → rose-500
  ["#a3e635", "#10b981"], // lime-400 → emerald-500
];

/** A person's solid color — the `from` stop of their avatar gradient. */
export function memberColor(seed: string): string {
  return memberPalette(seed)[0];
}

/** A person's full `[from, to]` avatar gradient, as hex. */
export function memberPalette(seed: string): readonly [string, string] {
  return MEMBER_PALETTES[nameHash(seed) % MEMBER_PALETTES.length];
}

/**
 * Ink for anything *printed* in a person's color — a stamp, a label on paper.
 *
 * Built from the gradient's deeper `to` stop: the 400-level `from` colors
 * are chosen to glow on an avatar, which makes several of them (lime, amber)
 * nearly illegible as text on the cream card, and mixing them toward ink
 * turns them grey. Mixing toward `--foreground` makes it work in both themes
 * at once: in light mode the foreground is dark teal ink, so the color
 * deepens; in dark mode it's cream, so the color lifts. Same hue family
 * either way.
 */
export function memberInk(seed: string): string {
  return `color-mix(in oklch, ${memberPalette(seed)[1]} 76%, var(--foreground))`;
}
