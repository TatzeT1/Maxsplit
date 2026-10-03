"use client";

import { useSyncExternalStore } from "react";
import {
  isGameSoundsMuted,
  setGameSoundsMuted,
  subscribeGameSoundsMuted,
} from "@/lib/sound/game-sounds";

/**
 * The games' shared "Ton aus" setting as React state. The server renders
 * sound on — it can't see this device's storage — and the client corrects
 * it after hydration.
 */
export function useGameSoundsMuted(): [boolean, (next: boolean) => void] {
  const muted = useSyncExternalStore(subscribeGameSoundsMuted, isGameSoundsMuted, () => false);
  return [muted, setGameSoundsMuted];
}
