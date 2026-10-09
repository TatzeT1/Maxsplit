import type { SplitGameId } from "@/components/groups/split-game/game-catalog";

/**
 * One chunk loader per split-game dialog. The lazy dialogs
 * (lazy-dialogs.tsx) render through these and the picker prefetches through
 * them, so a prefetched chunk is the very one the dialog later renders from.
 */
export const gameLoaders = {
  lottery: () => import("@/components/groups/split-lottery-dialog"),
  wheel: () => import("@/components/groups/split-wheel-dialog"),
  slot: () => import("@/components/groups/split-slot-dialog"),
  scratch: () => import("@/components/groups/split-scratch-dialog"),
  balloon: () => import("@/components/groups/split-balloon-dialog"),
  duckrace: () => import("@/components/groups/split-duck-race-dialog"),
  dicecup: () => import("@/components/groups/split-dice-dialog"),
  pegboard: () => import("@/components/groups/split-pegboard-dialog"),
  tictactoe: () => import("@/components/groups/split-tic-tac-toe-dialog"),
  connectfour: () => import("@/components/groups/split-connect-four-dialog"),
  memory: () => import("@/components/groups/split-memory-dialog"),
  reaction: () => import("@/components/groups/split-reaction-dialog"),
  rps: () => import("@/components/groups/split-rps-dialog"),
  nim: () => import("@/components/groups/split-nim-dialog"),
  dots: () => import("@/components/groups/split-dots-dialog"),
  finger: () => import("@/components/groups/split-finger-dialog"),
  estimate: () => import("@/components/groups/split-estimate-dialog"),
} satisfies Record<SplitGameId, () => Promise<unknown>>;

/**
 * Starts fetching a game's chunk ahead of time — the picker calls this when a
 * tile's preview opens, so "Los geht's" finds the code already there. A
 * failed prefetch is dropped on purpose: rendering the game imports the chunk
 * again, and that attempt's failure reaches the error boundary.
 */
export function preloadSplitGame(id: SplitGameId): void {
  gameLoaders[id]().catch(() => {});
}
