"use client";

import { useState } from "react";

/**
 * The "who's playing, how many pay" state every luck game's setup step needs:
 * the pool (everyone at first), the payer count with its stepper, and the
 * stepper's direction for the digit animation. The count is clamped to
 * whatever the game allows for the *current* pool, so shrinking the pool can
 * never leave a count that no longer fits.
 *
 * `maxLoserCountFor` is per game because the rules differ: the wheel lets
 * everybody pay, while the balloon, dice, ducks and pegboard always keep one
 * person dry.
 */
export function useGamePoolSetup(
  memberUids: string[],
  maxLoserCountFor: (poolSize: number) => number,
) {
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [requestedCount, setRequestedCount] = useState(1);
  const [stepperDirection, setStepperDirection] = useState<1 | -1>(1);

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  const maxLoserCount = maxLoserCountFor(Math.max(poolUids.length, 1));
  const loserCount = Math.min(Math.max(requestedCount, 1), maxLoserCount);

  function stepLoserCount(delta: number) {
    setStepperDirection(delta > 0 ? 1 : -1);
    setRequestedCount(Math.min(Math.max(loserCount + delta, 1), maxLoserCount));
  }

  return {
    poolUids,
    togglePoolMember,
    loserCount,
    maxLoserCount,
    stepLoserCount,
    stepperDirection,
  };
}
