"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATCH_FLASH_HOLD_MS,
  CATCH_FLASH_STEP_MS,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import { HAPTIC_STAMP, HAPTIC_STAMP_FINALE, cancelVibration, vibrate } from "@/lib/games/haptics";
import { playLaughSound, playStampSound } from "@/lib/sound/game-sounds";

/** The slip on screen right now. */
export interface CatchFlashState {
  /** Monotonic: keys the `CatchFlash`, so back-to-back catches each get a fresh slip, and seeds its confetti. */
  id: number;
  uid: string;
  /** The round's last catch: more confetti, a harder buzz, the full hold. */
  finale: boolean;
  /** Where this slip sits in a `catchEach` run (0 for a single catch). */
  index: number;
  /** How many slips the run has (1 for a single catch). */
  count: number;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * "Erwischt!" for every payer, in every luck game: the one place that knows
 * how a catch lands. A catch is a `CatchFlash` (the caller renders it from
 * `flash`, with its own stamp label and caption), and on its impact frame the
 * stamp sound, the laugh, the jolt of the play area (the returned ref) and a buzz
 * in the hand (Android; iOS has no vibration) — all keyed off
 * `STAMP_IMPACT_S`, so they read as one hit.
 *
 * - `catchOne` — a single catch the players just caused: a spin landing, a
 *   card scratched, a balloon popping, a face tapped. Replaces any slip still
 *   on screen and holds for `CATCH_FLASH_HOLD_MS`.
 * - `catchEach` — every payer of a round that was decided all at once (the
 *   dice, the ducks, the fingers): one slip after the other, each but the
 *   last held for `CATCH_FLASH_STEP_MS`, the finale only on the last. Pass
 *   `finale: false` for a run that more catches follow (a finger-race round
 *   before a replay): then the last slip is an ordinary one too.
 *
 * `active` is true from the call until the last slip has cleared — the
 * verdict and "Übernehmen" wait for it — and `isActive()` reads the same
 * synchronously, for a tap guard that two fingers in one frame can't slip
 * past. `cancel()` ("Neu mischen", closing) drops the slip, every pending
 * timer and a queued buzz; unmounting does the same. Under reduced motion
 * `CatchFlash` and the shake tone themselves down; the timing stays, so the
 * slip is still there long enough to read.
 */
export function useCatchFlashes() {
  const [stageRef, shake] = useImpactShake<HTMLDivElement>();
  const [flash, setFlash] = useState<CatchFlashState | null>(null);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const idRef = useRef(0);
  const timersRef = useRef<Timer[]>([]);

  useEffect(() => {
    // The same array for the hook's whole lifetime — only ever pushed to and emptied.
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      cancelVibration();
    };
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.length = 0;
  }, []);

  const setBusy = useCallback((busy: boolean) => {
    activeRef.current = busy;
    setActive(busy);
  }, []);

  const later = useCallback((ms: number, action: () => void) => {
    if (ms <= 0) action();
    else timersRef.current.push(setTimeout(action, ms));
  }, []);

  const hit = useCallback(
    (uid: string, finale: boolean, index: number, count: number) => {
      playStampSound(STAMP_IMPACT_S);
      playLaughSound(STAMP_IMPACT_S + 0.1);
      shake();
      vibrate(finale ? HAPTIC_STAMP_FINALE : HAPTIC_STAMP, STAMP_IMPACT_S * 1000);
      idRef.current += 1;
      setFlash({ id: idRef.current, uid, finale, index, count });
    },
    [shake],
  );

  const finish = useCallback(
    (onDone?: () => void) => {
      setFlash(null);
      setBusy(false);
      onDone?.();
    },
    [setBusy],
  );

  /** One catch, now or after `delayMs` (a beat after a bang). */
  const catchOne = useCallback(
    (uid: string, options: { finale?: boolean; delayMs?: number; onDone?: () => void } = {}) => {
      const { finale = false, delayMs = 0, onDone } = options;
      clearTimers();
      setBusy(true);
      later(delayMs, () => hit(uid, finale, 0, 1));
      later(delayMs + CATCH_FLASH_HOLD_MS, () => finish(onDone));
    },
    [clearTimers, finish, hit, later, setBusy],
  );

  /** Every payer in turn, in the order given; the last one is the finale unless `finale` is false. */
  const catchEach = useCallback(
    (
      uids: readonly string[],
      options: { delayMs?: number; finale?: boolean; onDone?: () => void } = {},
    ) => {
      const { delayMs = 0, finale = true, onDone } = options;
      clearTimers();
      if (uids.length === 0) {
        finish(onDone);
        return;
      }
      setBusy(true);
      let at = delayMs;
      uids.forEach((uid, index) => {
        const last = finale && index === uids.length - 1;
        later(at, () => hit(uid, last, index, uids.length));
        at += last ? CATCH_FLASH_HOLD_MS : CATCH_FLASH_STEP_MS;
      });
      later(at, () => finish(onDone));
    },
    [clearTimers, finish, hit, later, setBusy],
  );

  /** Drops the slip and everything still scheduled — "Neu mischen", closing, a new spin. */
  const cancel = useCallback(() => {
    clearTimers();
    cancelVibration();
    setFlash(null);
    setBusy(false);
  }, [clearTimers, setBusy]);

  const isActive = useCallback(() => activeRef.current, []);

  // A tuple like `useImpactShake`'s: the ref apart from the state, so reading
  // `flash` during render isn't mistaken for reading a ref.
  return [stageRef, { shake, flash, active, isActive, catchOne, catchEach, cancel }] as const;
}
