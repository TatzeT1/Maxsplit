import { nameHash } from "@/lib/utils";

/**
 * Deterministic solid wedge/reel colors for the wheel and slot machine,
 * indexed by the same name hash as `avatarGradient` — same order as
 * `AVATAR_GRADIENTS` in `lib/utils.ts` — so a member's wheel wedge or reel
 * chip reads as the same color family as their avatar everywhere else.
 */
const MEMBER_COLORS = [
  "#fb923c", // orange-400, pairs with avatarGradient's orange→rose
  "#2dd4bf", // teal-400
  "#a78bfa", // violet-400
  "#fbbf24", // amber-400
  "#34d399", // emerald-400
  "#38bdf8", // sky-400
  "#f472b6", // pink-400
  "#a3e635", // lime-400
];

export function memberColor(seed: string): string {
  return MEMBER_COLORS[nameHash(seed) % MEMBER_COLORS.length];
}
