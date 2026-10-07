/**
 * A buzz in the hand for the games' big beats, through the Vibration API.
 *
 * Android Chrome vibrates; iOS Safari (standalone PWA included) has no
 * `navigator.vibrate` at all, so on an iPhone every call here is a silent
 * no-op. That is why a buzz may only ever double something the screen and
 * the speaker already say — it never carries information of its own.
 *
 * A delay is built into the pattern itself (a 0 ms buzz, then a pause), not
 * into a timer: the buzz then needs no cleanup of its own, and still lands on
 * the stamp's impact frame. `cancelVibration` stops whatever is still
 * queued, for "Neu mischen" and closing a game.
 */

export type HapticPattern = number | readonly number[];

/** One stamp hitting the slip: a short, solid thump. */
export const HAPTIC_STAMP: HapticPattern = 45;
/** The round's last stamp: a thump, a breath, a longer one. */
export const HAPTIC_STAMP_FINALE: HapticPattern = [45, 70, 110];

/** When the last pattern started here ends, so a cancel without anything queued stays a no-op. */
let buzzingUntil = 0;

function vibrationApi(): ((pattern: number | number[]) => boolean) | null {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return null;
  return navigator.vibrate.bind(navigator);
}

/**
 * Buzzes `pattern` (ms on, ms off, ms on …) after `delayMs`. Returns whether
 * the device took it; `false` where vibration isn't supported or is blocked.
 */
export function vibrate(pattern: HapticPattern, delayMs = 0): boolean {
  const api = vibrationApi();
  if (!api) return false;
  const steps = typeof pattern === "number" ? [pattern] : [...pattern];
  const delay = Math.max(Math.round(delayMs), 0);
  const full = delay > 0 ? [0, delay, ...steps] : steps;
  try {
    const accepted = api(full.length === 1 ? full[0] : full);
    if (accepted) buzzingUntil = Date.now() + full.reduce((sum, step) => sum + step, 0);
    return accepted;
  } catch {
    // Some embedded browsers throw instead of returning false.
    return false;
  }
}

/** Stops a buzz that is still queued or running. Does nothing when nothing is. */
export function cancelVibration(): void {
  if (Date.now() >= buzzingUntil) return;
  buzzingUntil = 0;
  const api = vibrationApi();
  if (!api) return;
  try {
    api(0);
  } catch {
    // Nothing to stop.
  }
}
