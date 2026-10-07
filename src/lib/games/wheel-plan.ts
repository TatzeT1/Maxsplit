/**
 * Pure Glücksrad staging. Who pays is decided *first* — `useSequentialDraw`
 * fixes the order with `secureShuffle` before anyone touches the wheel — and
 * everything here only plans how the wheel gets there: how long a spin
 * lasts, how many turns it takes, where inside the drawn wedge it stops, and
 * now and then a nail-biter on the peg before it. The swing of a flick
 * changes the show; the target wedge is always the one the caller passes.
 *
 * Geometry, used throughout. The needle is fixed at the top. The disc is
 * printed in *disc angles*, clockwise from the top: wedge `i` of a layout
 * spans `origin + i·seg … origin + (i + 1)·seg`. Turning the disc clockwise
 * by `rotation` degrees puts disc angle `−rotation` under the needle, so as
 * the rotation grows the needle runs through the wedges backwards. Rotations
 * are never wrapped (a spin always goes on from where the last one ended);
 * disc angles are, modulo 360.
 */

/** About this many rim pegs ratchet past the flapper per turn, whatever the number of wedges. */
export const WHEEL_PEG_TARGET = 24;
/** Below this the release reads as a nudge, not a swing: the wheel wobbles back ("Zu lasch!"). In °/s. */
export const MIN_FLICK_DPS = 240;
/** Faster flicks count as this fast, so one glitchy pointer sample can't send the wheel off for a minute. */
export const MAX_FLICK_DPS = 2400;
/** The "Drehen" button's made-up swing: a solid flick, somewhere in this range. */
const BUTTON_SWING_MIN_DPS = 600;
const BUTTON_SWING_MAX_DPS = 2000;
/** How long the main spin takes, from the weakest swing to the strongest, before jitter. */
const MIN_SPIN_SEC = 3.4;
const MAX_SPIN_SEC = 6.2;
/** ± this share of the duration, so two equal swings still spin a little differently. */
const SPIN_SEC_JITTER = 0.06;
/** Every spin goes round at least twice: less reads as a nudge onto a wedge someone picked. */
const MIN_TRAVEL_DEG = 720;
/**
 * The main spin is an ease-out `1 − (1 − τ)^power`; its first-frame speed is
 * `power · travel / duration`. The power is picked so that speed equals the
 * swing — the wheel leaves the finger at the finger's own speed — within
 * these bounds: below 1.8 the stop gets abrupt, so a very weak (but valid)
 * flick gets a slight push instead.
 */
const NOMINAL_POWER = 2.6;
const MIN_POWER = 1.8;
const MAX_POWER = 4;
/** About one spin in four hangs on the peg before the drawn wedge. */
export const NAIL_BITER_CHANCE = 0.25;
/** The nail-biter tips over this far into the drawn wedge, as a share of the wedge. */
const NAIL_BITER_LAND_MIN = 0.03;
const NAIL_BITER_LAND_MAX = 0.08;
/** The peg first touches the flapper this far before it reaches the needle: a share of the peg gap, at most a few degrees. */
const CONTACT_PEG_SHARE = 0.45;
const CONTACT_MAX_DEG = 6;
/** Where the strain peaks: the wheel creeps up to this close to the peg, then the peg slips past. */
const HANG_STOP_SHORT_DEG = 0.5;
/** How long it hangs there, trembling. */
const HANG_MIN_SEC = 0.9;
const HANG_MAX_SEC = 1.5;
/** The tip over the peg: quick, like a spring letting go. */
export const NAIL_BITER_TIP_SEC = 0.24;
const CREEP_POWER = 1.6;
const TIP_POWER = 2.2;
/** The flapper bends this far at the height of the hang, against the direction of travel. */
export const FLAPPER_LEAN_MAX_DEG = 30;
const FLAPPER_TREMOR_DEG = 1.6;
const FLAPPER_TREMOR_HZ = 13;
/** A flick is measured over the last this many ms of the drag… */
export const FLICK_WINDOW_MS = 100;
/** …and counts for nothing if the finger rested this long before it lifted. */
export const FLICK_STALE_MS = 80;
/** A drag shorter than this, released without swing, was a touch, not a try: it slips back without comment. */
const NUDGE_DEG = 6;
/** Up to this many wedges, first names fit on the wheel; above it, initials. */
export const WHEEL_NAME_MAX_WEDGES = 8;
/** A name chip narrower than this says less than an initial. */
const MIN_NAME_CHIP_PX = 30;
const MAX_NAME_CHIP_PX = 96;

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Equal wedges, the first starting at disc angle `origin`. */
export interface WheelLayout {
  count: number;
  origin: number;
}

/** The disc angle under the needle at `rotation`, in [0, 360). */
export function needleAngle(rotation: number): number {
  return mod(-rotation, 360);
}

/**
 * The wedge the needle points into at `rotation`, and how far into it (0 at
 * its start, 1 at its end, in disc-angle order).
 */
export function wedgeUnderNeedle(
  rotation: number,
  layout: WheelLayout,
): { index: number; fraction: number } {
  const seg = 360 / layout.count;
  const local = mod(needleAngle(rotation) - layout.origin, 360);
  const index = Math.min(Math.floor(local / seg), layout.count - 1);
  return { index, fraction: (local - index * seg) / seg };
}

/**
 * Pegs per wedge: about `WHEEL_PEG_TARGET` round the rim, and always one on
 * every wedge boundary — so a two-person wheel ratchets as busily as an
 * eight-person one, and the nail-biter has a peg to hang on between two
 * wedges.
 */
export function pegsPerWedge(count: number): number {
  return Math.max(1, Math.round(WHEEL_PEG_TARGET / Math.max(count, 1)));
}

/** Degrees between two neighbouring pegs of a settled layout. */
export function pegGap(count: number): number {
  return 360 / (Math.max(count, 1) * pegsPerWedge(count));
}

/**
 * How many pegs have passed the needle at `rotation` (any fixed reference
 * will do): it changes by exactly one each time a peg crosses, up when the
 * wheel turns clockwise, down when it turns back.
 */
export function pegIndexAt(rotation: number, layout: WheelLayout): number {
  return Math.floor((rotation + layout.origin) / pegGap(layout.count));
}

/** One stretch of a spin: an ease-out from `from` to `to`, ending `endSec` after the start. */
export interface WheelSpinPhase {
  endSec: number;
  from: number;
  to: number;
  power: number;
}

export interface WheelNailBiter {
  /** The main spin is over: the boundary peg has met the flapper and the hang begins. */
  hangSec: number;
  /** The peg slips past the flapper. */
  tipSec: number;
  /** Rotation where the hang begins. */
  contactRotation: number;
  /** Rotation where the boundary peg is right under the needle. */
  pegRotation: number;
}

export interface WheelSpinPlan {
  from: number;
  /** Where it comes to rest: inside the target wedge, always. */
  to: number;
  /** 1 clockwise, −1 anticlockwise — whichever way it was flicked. */
  direction: 1 | -1;
  durationSec: number;
  phases: WheelSpinPhase[];
  nailBiter: WheelNailBiter | null;
}

export interface WheelSpinInput {
  /** The rotation it starts from — wherever the finger let go. */
  from: number;
  layout: WheelLayout;
  /** The wedge the draw already picked. The only thing that decides where it stops. */
  targetIndex: number;
  /** The swing in °/s, signed (positive is clockwise). The button passes `buttonSwing()`. */
  velocity: number;
  /** 0 under reduced motion; defaults to `NAIL_BITER_CHANCE`. */
  nailBiterChance?: number;
  /** Decorative randomness only (duration jitter, the spot inside the wedge, the nail-biter's roll). */
  random?: () => number;
}

/** The button's spin: a swing as if someone gave it a solid flick, clockwise. */
export function buttonSwing(random: () => number = Math.random): number {
  return BUTTON_SWING_MIN_DPS + random() * (BUTTON_SWING_MAX_DPS - BUTTON_SWING_MIN_DPS);
}

/**
 * Plans a spin that ends inside wedge `targetIndex`. The swing sets how long
 * the main spin lasts and how far it goes (a harder flick spins longer and
 * further, and leaves the finger at the finger's speed); the decorative
 * `random` sets the jitter and the resting spot. Neither can change the
 * wedge.
 *
 * A plain spin comes to rest between two pegs in the middle half of the
 * wedge, never on a peg. A nail-biter decelerates until the peg *before* the
 * target wedge — the boundary it enters by — meets the flapper, creeps
 * against it for a second or so while the flapper bends, then tips over and
 * stops 3–8 % inside the target wedge, still short of its first inner peg.
 * Every phase is an ease-out, so the wheel only ever moves one way.
 */
export function planWheelSpin(input: WheelSpinInput): WheelSpinPlan {
  const { from, layout, targetIndex } = input;
  const random = input.random ?? Math.random;
  const chance = input.nailBiterChance ?? NAIL_BITER_CHANCE;
  const count = Math.max(layout.count, 1);
  const seg = 360 / count;
  const pegs = pegsPerWedge(count);
  const direction: 1 | -1 = input.velocity < 0 ? -1 : 1;
  const swing = clamp(Math.abs(input.velocity), MIN_FLICK_DPS, MAX_FLICK_DPS);
  const strength = (swing - MIN_FLICK_DPS) / (MAX_FLICK_DPS - MIN_FLICK_DPS);
  const mainSec =
    (MIN_SPIN_SEC + (MAX_SPIN_SEC - MIN_SPIN_SEC) * strength ** 0.8) *
    (1 - SPIN_SEC_JITTER + random() * 2 * SPIN_SEC_JITTER);
  const wanted = Math.max((swing * mainSec) / NOMINAL_POWER, MIN_TRAVEL_DEG);
  const low = layout.origin + targetIndex * seg;
  const high = low + seg;

  // Travel (along `direction`, never negative) until disc angle `angle` is
  // under the needle — the whole number of extra turns closest to `near`,
  // but at least `atLeast`.
  const travelTo = (angle: number, near: number, atLeast: number) => {
    const base = mod(direction * (-from - angle), 360);
    let turns = Math.round((near - base) / 360);
    while (base + turns * 360 < atLeast) turns += 1;
    return base + turns * 360;
  };
  const mainPower = (travel: number) => clamp((swing * mainSec) / travel, MIN_POWER, MAX_POWER);
  const at = (travel: number) => from + direction * travel;

  if (count > 1 && random() < chance) {
    // The needle enters the target wedge by its high edge when the wheel
    // turns clockwise (the needle runs backwards through disc angles), by
    // its low edge when it turns back.
    const entering = direction > 0 ? high : low;
    const gap = seg / pegs;
    const contact = Math.min(CONTACT_MAX_DEG, gap * CONTACT_PEG_SHARE);
    const pegTravel = travelTo(entering, wanted + contact, MIN_TRAVEL_DEG + contact);
    const contactTravel = pegTravel - contact;
    const share = NAIL_BITER_LAND_MIN + random() * (NAIL_BITER_LAND_MAX - NAIL_BITER_LAND_MIN);
    const landTravel = pegTravel + share * seg;
    const hangSec = mainSec;
    const tipSec = hangSec + HANG_MIN_SEC + random() * (HANG_MAX_SEC - HANG_MIN_SEC);
    const durationSec = tipSec + NAIL_BITER_TIP_SEC;
    return {
      from,
      to: at(landTravel),
      direction,
      durationSec,
      phases: [
        { endSec: hangSec, from, to: at(contactTravel), power: mainPower(contactTravel) },
        {
          endSec: tipSec,
          from: at(contactTravel),
          to: at(pegTravel - HANG_STOP_SHORT_DEG),
          power: CREEP_POWER,
        },
        {
          endSec: durationSec,
          from: at(pegTravel - HANG_STOP_SHORT_DEG),
          to: at(landTravel),
          power: TIP_POWER,
        },
      ],
      nailBiter: {
        hangSec,
        tipSec,
        contactRotation: at(contactTravel),
        pegRotation: at(pegTravel),
      },
    };
  }

  // Rest between two pegs, in one of the peg slots whose centre lies in the
  // wedge's middle half, somewhere in the middle half of that slot.
  const slots: number[] = [];
  for (let slot = 0; slot < pegs; slot++) {
    const centre = (slot + 0.5) / pegs;
    if (centre >= 0.25 - 1e-9 && centre <= 0.75 + 1e-9) slots.push(slot);
  }
  const slot = slots[Math.min(Math.floor(random() * slots.length), slots.length - 1)];
  const rest = low + ((slot + 0.25 + random() * 0.5) * seg) / pegs;
  const travel = travelTo(rest, wanted, MIN_TRAVEL_DEG);
  return {
    from,
    to: at(travel),
    direction,
    durationSec: mainSec,
    phases: [{ endSec: mainSec, from, to: at(travel), power: mainPower(travel) }],
    nailBiter: null,
  };
}

/** The wheel's rotation `sec` seconds into a spin: `from` at 0, `to` from `durationSec` on. */
export function wheelRotationAt(plan: WheelSpinPlan, sec: number): number {
  let start = 0;
  for (const phase of plan.phases) {
    if (sec < phase.endSec) {
      const tau = clamp((sec - start) / (phase.endSec - start), 0, 1);
      return phase.from + (phase.to - phase.from) * (1 - (1 - tau) ** phase.power);
    }
    start = phase.endSec;
  }
  return plan.to;
}

/**
 * How far the flapper leans during a nail-biter's hang, in degrees: bent
 * further the closer the peg creeps, with a tremor that grows with the
 * strain. Against the direction of travel — the peg pushes the flapper's tip
 * along with it. 0 outside the hang.
 */
export function flapperLeanAt(plan: WheelSpinPlan, sec: number): number {
  const nailBiter = plan.nailBiter;
  if (!nailBiter || sec < nailBiter.hangSec || sec >= nailBiter.tipSec) return 0;
  const room = (nailBiter.pegRotation - nailBiter.contactRotation) * plan.direction;
  const crept = (wheelRotationAt(plan, sec) - nailBiter.contactRotation) * plan.direction;
  const bend = clamp(crept / room, 0, 1);
  const tremor =
    Math.sin((sec - nailBiter.hangSec) * 2 * Math.PI * FLAPPER_TREMOR_HZ) *
    FLAPPER_TREMOR_DEG *
    bend;
  return -plan.direction * (FLAPPER_LEAN_MAX_DEG * bend ** 0.7 + tremor);
}

/** One pointer reading during a drag: when (ms), and where the wheel was turned to. */
export interface FlickSample {
  t: number;
  rotation: number;
}

/**
 * The swing a drag ends with, in °/s (signed like the rotation): the average
 * over its last `FLICK_WINDOW_MS`, or 0 when the finger rested before it
 * lifted. If only the very last reading falls in the window, the one before
 * it stands in, so a quick flick of two events still counts.
 */
export function flickVelocity(samples: readonly FlickSample[], releaseAt: number): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (releaseAt - last.t > FLICK_STALE_MS) return 0;
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > FLICK_WINDOW_MS) break;
    first = samples[i];
  }
  if (first === last) {
    const previous = samples[samples.length - 2];
    if (last.t - previous.t > FLICK_WINDOW_MS * 2) return 0;
    first = previous;
  }
  const elapsed = last.t - first.t;
  if (elapsed <= 0) return 0;
  return ((last.rotation - first.rotation) / elapsed) * 1000;
}

/** What a released drag does: spin, wobble back with "Zu lasch!", or slip back quietly. */
export type FlickRelease = "spin" | "weak" | "nudge";

export function classifyRelease(velocity: number, draggedDeg: number): FlickRelease {
  if (Math.abs(velocity) >= MIN_FLICK_DPS) return "spin";
  return Math.abs(draggedDeg) >= NUDGE_DEG ? "weak" : "nudge";
}

/** The pointer's angle around the wheel's centre, in screen degrees (clockwise from the right, like CSS). */
export function pointerAngle(x: number, y: number, centreX: number, centreY: number): number {
  return (Math.atan2(y - centreY, x - centreX) * 180) / Math.PI;
}

/** The shortest turn from angle `from` to angle `to`, in (−180, 180]: unwraps a drag across the ±180° seam. */
export function angleDelta(from: number, to: number): number {
  const delta = mod(to - from + 180, 360) - 180;
  return delta === -180 ? 180 : delta;
}

/** The caught wedge closing up under the needle (`progress` 0 → 1). */
export interface LeavingWedge {
  uid: string;
  progress: number;
  /** Where in it the needle came to rest (0 at its start, 1 at its end) — it closes up toward that spot. */
  anchor: number;
}

export interface WheelArc {
  uid: string;
  /** Disc angle relative to the face's `origin`. */
  start: number;
  size: number;
  leaving: boolean;
}

export interface WheelPeg {
  /** Stable while the face animates: the wedge's uid and the peg's place in it. */
  key: string;
  /** Disc angle relative to the face's `origin`. */
  angle: number;
  /** On a wedge boundary (the bigger peg at the end of a divider). */
  boundary: boolean;
  opacity: number;
}

export interface WheelFace {
  origin: number;
  arcs: WheelArc[];
  pegs: WheelPeg[];
}

/**
 * What the disc shows: one arc per wedge and the peg ring. With a `leaving`
 * wedge it is the moment after a catch — that wedge shrinks to nothing while
 * the others widen into its room, instead of the whole wheel re-printing in
 * one frame. The origin moves with it so the needle keeps pointing at the
 * same spot of the shrinking wedge, and the neighbours close in on the
 * needle from both sides; at `progress` 1 the face is exactly the settled
 * face of the wheel without that wedge. The rotation never changes, so
 * nothing ratchets.
 *
 * The pegs are re-spaced with it: the other wedges' share of pegs grows from
 * `pegsPerWedge(n)` toward `pegsPerWedge(n − 1)`, each new peg emerging from
 * the next boundary and fading in; the leaving wedge's inner pegs fade out.
 */
export function wheelFace(
  uids: readonly string[],
  origin: number,
  leaving: LeavingWedge | null = null,
): WheelFace {
  const count = uids.length;
  const leavingIndex = leaving ? uids.indexOf(leaving.uid) : -1;
  const progress = leaving && leavingIndex >= 0 && count > 1 ? clamp(leaving.progress, 0, 1) : 0;
  const total = count - progress;
  const arcs: WheelArc[] = [];
  let start = 0;
  uids.forEach((uid, index) => {
    const size = ((index === leavingIndex ? 1 - progress : 1) * 360) / Math.max(total, 1e-9);
    arcs.push({ uid, start, size, leaving: index === leavingIndex });
    start += size;
  });

  let faceOrigin = origin;
  if (leaving && leavingIndex >= 0) {
    const seg = 360 / count;
    const before = (leavingIndex + leaving.anchor) * seg;
    const arc = arcs[leavingIndex];
    faceOrigin = origin + before - (arc.start + leaving.anchor * arc.size);
  }

  const pegs: WheelPeg[] = [];
  const pegsBefore = pegsPerWedge(count);
  const pegsAfter = leavingIndex >= 0 && count > 1 ? pegsPerWedge(count - 1) : pegsBefore;
  const pegsNow = pegsBefore + (pegsAfter - pegsBefore) * progress;
  for (const arc of arcs) {
    if (arc.leaving) {
      for (let j = 0; j < pegsBefore; j++) {
        pegs.push({
          key: `${arc.uid}:${j}`,
          angle: arc.start + (arc.size * j) / pegsBefore,
          boundary: j === 0,
          // Gone well before they bunch up into a string of beads under the needle.
          opacity: j === 0 ? 1 : Math.max(0, 1 - progress * 2.5),
        });
      }
      continue;
    }
    for (let j = 0; j < pegsNow; j++) {
      pegs.push({
        key: `${arc.uid}:${j}`,
        angle: arc.start + arc.size * Math.min(j / pegsNow, 1),
        boundary: j === 0,
        opacity: Math.min(1, pegsNow - j),
      });
    }
  }
  return { origin: faceOrigin, arcs, pegs };
}

/** The settled origin once `leaving` has gone, in [0, 360). */
export function originAfterLeaving(
  uids: readonly string[],
  origin: number,
  leaving: LeavingWedge,
): number {
  return mod(wheelFace(uids, origin, { ...leaving, progress: 1 }).origin, 360);
}

/** The first word of a display name: what goes on a wedge. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

/**
 * The widest a name chip may be on a wedge of `sizeDeg` degrees, whose inner
 * edge sits `radiusPx` from the hub: most of the chord there, so it clears
 * the dividers. `null` when the wedge is too narrow for a name to say more
 * than an initial.
 */
export function wedgeNameWidth(sizeDeg: number, radiusPx: number): number | null {
  const chord = sizeDeg >= 180 ? 2 * radiusPx : 2 * radiusPx * Math.sin((sizeDeg * Math.PI) / 360);
  const width = Math.min(chord * 0.8, MAX_NAME_CHIP_PX);
  return width >= MIN_NAME_CHIP_PX ? Math.floor(width) : null;
}
