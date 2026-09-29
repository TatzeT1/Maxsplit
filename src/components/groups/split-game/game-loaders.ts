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
  tictactoe: () => import("@/components/groups/split-tic-tac-toe-dialog"),
  connectfour: () => import("@/components/groups/split-connect-four-dialog"),
  memory: () => import("@/components/groups/split-memory-dialog"),
  reaction: () => import("@/components/groups/split-reaction-dialog"),
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
