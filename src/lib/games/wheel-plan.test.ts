import { describe, expect, it } from "vitest";
import {
  FLAPPER_LEAN_MAX_DEG,
  MAX_FLICK_DPS,
  MIN_FLICK_DPS,
  NAIL_BITER_TIP_SEC,
  WHEEL_PEG_TARGET,
  angleDelta,
  buttonSwing,
  classifyRelease,
  firstName,
  flapperLeanAt,
  flickVelocity,
  needleAngle,
  originAfterLeaving,
  pegGap,
  pegIndexAt,
  pegsPerWedge,
  planWheelSpin,
  pointerAngle,
  wedgeNameWidth,
  wedgeUnderNeedle,
  wheelFace,
  wheelRotationAt,
  type WheelLayout,
  type WheelSpinPlan,
} from "./wheel-plan";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus;

/** Every wedge count a group plausibly brings, every target, both directions, a spread of swings and starts. */
function* spins(
  nailBiterChance: number,
): Generator<{ plan: WheelSpinPlan; layout: WheelLayout; target: number; velocity: number }> {
  const random = seeded(nailBiterChance * 1000 + 7);
  for (let count = 1; count <= 20; count++) {
    for (const origin of [0, 37.5, -100.25]) {
      for (let target = 0; target < count; target++) {
        for (const velocity of [MIN_FLICK_DPS, 700, -1500, MAX_FLICK_DPS, -40_000]) {
          const from = (random() - 0.5) * 4000;
          const layout = { count, origin };
          const plan = planWheelSpin({
            from,
            layout,
            targetIndex: target,
            velocity,
            nailBiterChance,
            random,
          });
          yield { plan, layout, target, velocity };
        }
      }
    }
  }
}

describe("pegs", () => {
  it("puts about two dozen pegs round the rim, at least one per wedge", () => {
    expect(pegsPerWedge(2)).toBe(12);
    expect(pegsPerWedge(3)).toBe(8);
    expect(pegsPerWedge(5)).toBe(5);
    expect(pegsPerWedge(8)).toBe(3);
    expect(pegsPerWedge(30)).toBe(1);
    for (let count = 1; count <= 16; count++) {
      const total = count * pegsPerWedge(count);
      expect(total).toBeGreaterThanOrEqual(WHEEL_PEG_TARGET * 0.7);
      expect(total).toBeLessThanOrEqual(WHEEL_PEG_TARGET * 1.4);
    }
  });

  it("counts exactly one peg per crossing, in both directions", () => {
    const layout = { count: 3, origin: 20 };
    const gap = pegGap(3);
    expect(gap).toBe(15);
    // Peg k sits at disc angle origin + k·gap; it is under the needle when
    // rotation + origin is a multiple of the gap.
    const onPeg = -20 + gap * 5;
    expect(pegIndexAt(onPeg - 0.01, layout) + 1).toBe(pegIndexAt(onPeg + 0.01, layout));
    let crossings = 0;
    let last = pegIndexAt(0, layout);
    for (let rotation = 0; rotation <= 360; rotation += 0.5) {
      const index = pegIndexAt(rotation, layout);
      crossings += Math.abs(index - last);
      last = index;
    }
    expect(crossings).toBe(3 * pegsPerWedge(3));
  });
});

describe("planWheelSpin", () => {
  it("always comes to rest inside the drawn wedge", () => {
    for (const chance of [0, 1]) {
      for (const { plan, layout, target } of spins(chance)) {
        expect(wedgeUnderNeedle(plan.to, layout).index).toBe(target);
        expect(wheelRotationAt(plan, plan.durationSec)).toBe(plan.to);
        expect(wheelRotationAt(plan, plan.durationSec + 5)).toBe(plan.to);
        expect(wheelRotationAt(plan, 0)).toBe(plan.from);
      }
    }
  });

  it("only ever turns one way: the way it was flicked", () => {
    for (const chance of [0, 1]) {
      for (const { plan, velocity } of spins(chance)) {
        expect(plan.direction).toBe(velocity < 0 ? -1 : 1);
        let previous = plan.from;
        let backwards = 0;
        for (let ms = 2; ms <= plan.durationSec * 1000 + 2; ms += 2) {
          const rotation = wheelRotationAt(plan, ms / 1000);
          if ((rotation - previous) * plan.direction < -1e-9) backwards += 1;
          previous = rotation;
        }
        expect(backwards).toBe(0);
      }
    }
  });

  it("goes round at least twice", () => {
    for (const chance of [0, 1]) {
      for (const { plan } of spins(chance)) {
        expect(Math.abs(plan.to - plan.from)).toBeGreaterThanOrEqual(720);
      }
    }
  });

  it("rests between two pegs in the middle of the wedge on a plain spin", () => {
    for (const { plan, layout } of spins(0)) {
      expect(plan.nailBiter).toBeNull();
      const { fraction } = wedgeUnderNeedle(plan.to, layout);
      expect(fraction).toBeGreaterThan(0.08);
      expect(fraction).toBeLessThan(0.92);
      const gap = pegGap(layout.count);
      const offPeg = mod(plan.to + layout.origin, gap);
      expect(Math.min(offPeg, gap - offPeg)).toBeGreaterThanOrEqual(gap * 0.25 - 1e-9);
    }
  });

  it("leaves the finger at the finger's speed, or a little faster — never slower", () => {
    for (const { plan, velocity } of spins(0)) {
      const swing = Math.min(Math.abs(velocity), MAX_FLICK_DPS);
      const dt = 0.0005;
      const speed = (Math.abs(wheelRotationAt(plan, dt) - plan.from) / dt) * 1;
      expect(speed).toBeGreaterThanOrEqual(swing * 0.98);
      expect(speed).toBeLessThanOrEqual(Math.max(swing, MIN_FLICK_DPS) * 2.6);
    }
  });

  it("spins longer the harder it's flicked", () => {
    const layout = { count: 4, origin: 0 };
    const durations = [MIN_FLICK_DPS, 600, 1200, 1800, MAX_FLICK_DPS].map(
      (velocity) =>
        planWheelSpin({
          from: 0,
          layout,
          targetIndex: 1,
          velocity,
          nailBiterChance: 0,
          random: () => 0.5,
        }).durationSec,
    );
    for (let i = 1; i < durations.length; i++) {
      expect(durations[i]).toBeGreaterThan(durations[i - 1]);
    }
    expect(durations[0]).toBeGreaterThanOrEqual(3);
    expect(durations[durations.length - 1]).toBeLessThanOrEqual(6.7);
  });

  it("never plays the nail-biter when it's switched off or there is only one wedge", () => {
    for (const { plan } of spins(0)) expect(plan.nailBiter).toBeNull();
    for (const { plan, layout } of spins(1)) {
      if (layout.count === 1) expect(plan.nailBiter).toBeNull();
      else expect(plan.nailBiter).not.toBeNull();
    }
  });

  it("hangs on the boundary peg, then tips 3–8 % into the drawn wedge", () => {
    for (const { plan, layout, target } of spins(1)) {
      const nailBiter = plan.nailBiter;
      if (!nailBiter) continue;
      const seg = 360 / layout.count;
      // The edge it enters by: the high one turning clockwise, the low one turning back.
      const edge = layout.origin + (target + (plan.direction > 0 ? 1 : 0)) * seg;
      expect(mod(needleAngle(nailBiter.pegRotation) - edge + 1e-6, 360)).toBeLessThan(1e-5);
      const { fraction } = wedgeUnderNeedle(plan.to, layout);
      const intoWedge = plan.direction > 0 ? 1 - fraction : fraction;
      expect(intoWedge).toBeGreaterThanOrEqual(0.03 - 1e-9);
      expect(intoWedge).toBeLessThanOrEqual(0.08 + 1e-9);

      // The hang: from contact up to just short of the peg, in the wedge before.
      expect(wheelRotationAt(plan, nailBiter.hangSec)).toBeCloseTo(nailBiter.contactRotation, 9);
      const atTip = wheelRotationAt(plan, nailBiter.tipSec);
      expect((nailBiter.pegRotation - atTip) * plan.direction).toBeGreaterThan(0);
      expect(wedgeUnderNeedle(atTip, layout).index).toBe(
        (target + plan.direction + layout.count) % layout.count,
      );
      expect(nailBiter.tipSec - nailBiter.hangSec).toBeGreaterThanOrEqual(0.9);
      expect(nailBiter.tipSec - nailBiter.hangSec).toBeLessThanOrEqual(1.5);
      expect(plan.durationSec - nailBiter.tipSec).toBeCloseTo(NAIL_BITER_TIP_SEC, 9);

      // No peg passes during the hang, and exactly one — the boundary — on the tip.
      expect(pegIndexAt(atTip, layout)).toBe(pegIndexAt(nailBiter.contactRotation, layout));
      expect(pegIndexAt(plan.to, layout) - pegIndexAt(atTip, layout)).toBe(plan.direction);
    }
  });

  it("lands where the draw says whatever the swing", () => {
    const layout = { count: 6, origin: 12 };
    for (let target = 0; target < 6; target++) {
      for (let velocity = -3000; velocity <= 3000; velocity += 250) {
        const plan = planWheelSpin({ from: 123, layout, targetIndex: target, velocity });
        expect(wedgeUnderNeedle(plan.to, layout).index).toBe(target);
      }
    }
  });

  it("gives the button a solid clockwise swing", () => {
    expect(buttonSwing(() => 0)).toBeGreaterThanOrEqual(MIN_FLICK_DPS);
    expect(buttonSwing(() => 1)).toBeLessThanOrEqual(MAX_FLICK_DPS);
  });
});

describe("flapperLeanAt", () => {
  it("bends against the travel only while it hangs, and never past the maximum", () => {
    for (const { plan } of spins(1)) {
      const nailBiter = plan.nailBiter;
      if (!nailBiter) continue;
      expect(flapperLeanAt(plan, nailBiter.hangSec - 0.01)).toBe(0);
      expect(flapperLeanAt(plan, nailBiter.tipSec)).toBe(0);
      let wrong = 0;
      for (let sec = nailBiter.hangSec; sec < nailBiter.tipSec; sec += 0.02) {
        const lean = flapperLeanAt(plan, sec);
        if (Math.abs(lean) > FLAPPER_LEAN_MAX_DEG + 2) wrong += 1;
        if (sec > nailBiter.hangSec + 0.3 && lean * plan.direction >= 0) wrong += 1;
      }
      expect(wrong).toBe(0);
    }
    const plain = planWheelSpin({
      from: 0,
      layout: { count: 3, origin: 0 },
      targetIndex: 0,
      velocity: 900,
      nailBiterChance: 0,
    });
    expect(flapperLeanAt(plain, 2)).toBe(0);
  });
});

describe("the drag", () => {
  it("measures the swing over the last moments of the drag", () => {
    // 900 °/s for 200 ms, sampled at 60 Hz.
    const samples = Array.from({ length: 13 }, (_, i) => ({
      t: 1000 + i * 16.7,
      rotation: 40 + i * 16.7 * 0.9,
    }));
    expect(flickVelocity(samples, 1000 + 12 * 16.7 + 5)).toBeCloseTo(900, 6);
    // Backwards.
    const back = samples.map((sample) => ({ ...sample, rotation: -sample.rotation }));
    expect(flickVelocity(back, 1000 + 12 * 16.7 + 5)).toBeCloseTo(-900, 6);
  });

  it("ignores a fast start once the finger slows down", () => {
    const samples = [
      { t: 0, rotation: 0 },
      { t: 20, rotation: 60 },
      { t: 40, rotation: 120 },
      { t: 200, rotation: 125 },
      { t: 250, rotation: 126 },
    ];
    expect(Math.abs(flickVelocity(samples, 255))).toBeLessThan(MIN_FLICK_DPS);
  });

  it("is no flick if the finger rested before it lifted, or never moved", () => {
    const samples = [
      { t: 0, rotation: 0 },
      { t: 16, rotation: 30 },
    ];
    expect(flickVelocity(samples, 16 + 200)).toBe(0);
    expect(flickVelocity([{ t: 0, rotation: 0 }], 5)).toBe(0);
    expect(flickVelocity([], 5)).toBe(0);
  });

  it("still counts a flick of only two readings", () => {
    const samples = [
      { t: 0, rotation: 0 },
      { t: 150, rotation: 10 },
      { t: 170, rotation: 40 },
    ];
    expect(flickVelocity(samples, 175)).toBeCloseTo(1500, 6);
  });

  it("tells a spin from a weak flick from a touch", () => {
    expect(classifyRelease(MIN_FLICK_DPS, 30)).toBe("spin");
    expect(classifyRelease(-1200, 2)).toBe("spin");
    expect(classifyRelease(100, 40)).toBe("weak");
    expect(classifyRelease(-100, -40)).toBe("weak");
    expect(classifyRelease(0, 2)).toBe("nudge");
  });

  it("follows the finger round the centre, across the ±180° seam", () => {
    expect(pointerAngle(10, 0, 0, 0)).toBeCloseTo(0);
    // Screen y grows downwards, so below the centre is +90°: clockwise, like CSS rotate.
    expect(pointerAngle(0, 10, 0, 0)).toBeCloseTo(90);
    expect(angleDelta(170, -170)).toBeCloseTo(20);
    expect(angleDelta(-170, 170)).toBeCloseTo(-20);
    expect(angleDelta(10, 30)).toBeCloseTo(20);
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe("wheelFace", () => {
  const uids = ["a", "b", "c", "d", "e"];

  it("prints equal wedges from the origin with pegs on every boundary", () => {
    const face = wheelFace(uids, 30);
    expect(face.origin).toBe(30);
    expect(face.arcs.map((arc) => arc.start)).toEqual([0, 72, 144, 216, 288]);
    expect(face.arcs.every((arc) => arc.size === 72)).toBe(true);
    expect(face.pegs).toHaveLength(5 * pegsPerWedge(5));
    expect(face.pegs.filter((peg) => peg.boundary).map((peg) => peg.angle)).toEqual([
      0, 72, 144, 216, 288,
    ]);
    expect(face.pegs.every((peg) => peg.opacity === 1)).toBe(true);
  });

  it("starts the shrink exactly where the wheel stood", () => {
    const plain = wheelFace(uids, 30);
    const start = wheelFace(uids, 30, { uid: "c", progress: 0, anchor: 0.4 });
    expect(start.origin).toBeCloseTo(plain.origin, 9);
    expect(start.arcs.map((arc) => arc.size)).toEqual(plain.arcs.map((arc) => arc.size));
    expect(start.pegs.map((peg) => peg.angle)).toEqual(plain.pegs.map((peg) => peg.angle));
  });

  it("closes the caught wedge up under the needle", () => {
    const anchor = 0.4;
    const needle = 30 + (2 + anchor) * 72;
    for (let progress = 0; progress <= 1; progress += 0.1) {
      const face = wheelFace(uids, 30, { uid: "c", progress, anchor });
      const leaving = face.arcs[2];
      expect(leaving.leaving).toBe(true);
      expect(face.origin + leaving.start + anchor * leaving.size).toBeCloseTo(needle, 9);
      expect(leaving.size).toBeCloseTo((360 * (1 - progress)) / (5 - progress), 9);
      expect(face.arcs.reduce((sum, arc) => sum + arc.size, 0)).toBeCloseTo(360, 9);
    }
  });

  it("ends on exactly the settled face of the wheel without that wedge", () => {
    for (const [index, uid] of uids.entries()) {
      for (const anchor of [0.05, 0.5, 0.95]) {
        const leaving = { uid, progress: 1, anchor };
        const end = wheelFace(uids, -12, leaving);
        const origin = originAfterLeaving(uids, -12, leaving);
        const settled = wheelFace(
          uids.filter((other) => other !== uid),
          origin,
        );
        const shown = (face: typeof end) =>
          face.arcs
            .filter((arc) => !arc.leaving)
            .map((arc) => [
              arc.uid,
              mod(face.origin + arc.start, 360).toFixed(6),
              arc.size.toFixed(6),
            ]);
        expect(shown(end)).toEqual(shown(settled));
        const pegs = (face: typeof end) =>
          face.pegs
            .filter((peg) => peg.opacity > 0 && !peg.key.startsWith(`${uid}:`))
            .map((peg) => mod(face.origin + peg.angle, 360).toFixed(6))
            .sort();
        expect(pegs(end)).toEqual(pegs(settled));
        // The needle points at the boundary where the caught wedge closed up.
        const needle = -12 + (index + anchor) * 72;
        const boundary = end.origin + end.arcs[index].start;
        expect(mod(needle - boundary, 360)).toBeCloseTo(0, 6);
      }
    }
  });

  it("fades the newcomers in and the leaver's pegs out, never beyond 0–1", () => {
    const three = ["a", "b", "c"];
    for (let progress = 0; progress <= 1; progress += 0.05) {
      const face = wheelFace(three, 0, { uid: "b", progress, anchor: 0.5 });
      for (const peg of face.pegs) {
        expect(peg.opacity).toBeGreaterThanOrEqual(0);
        expect(peg.opacity).toBeLessThanOrEqual(1);
      }
      for (const arc of face.arcs) {
        for (const peg of face.pegs.filter((peg) => peg.key.startsWith(`${arc.uid}:`))) {
          expect(peg.angle).toBeGreaterThanOrEqual(arc.start - 1e-9);
          expect(peg.angle).toBeLessThanOrEqual(arc.start + arc.size + 1e-9);
        }
      }
    }
  });

  it("can't shrink the only wedge", () => {
    const face = wheelFace(["a"], 0, { uid: "a", progress: 0.7, anchor: 0.5 });
    expect(face.arcs[0].size).toBe(360);
  });
});

describe("names on the wedges", () => {
  it("prints the first name", () => {
    expect(firstName("Lea Sommer")).toBe("Lea");
    expect(firstName("  Max  ")).toBe("Max");
  });

  it("gives a name room on up to eight wedges, an initial below that", () => {
    expect(wedgeNameWidth(180, 80)).toBe(96);
    expect(wedgeNameWidth(360 / 8, 80)).toBeGreaterThanOrEqual(40);
    expect(wedgeNameWidth(10, 80)).toBeNull();
    // Narrower wedges, narrower chips.
    expect(wedgeNameWidth(60, 80)!).toBeGreaterThan(wedgeNameWidth(45, 80)!);
  });
});
