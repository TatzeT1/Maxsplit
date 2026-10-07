import { describe, expect, it } from "vitest";
import {
  DUCK_PROGRESS_STEPS,
  IDENTITY_WARP,
  MIN_FINISH_GAP_SEC,
  PHOTO_FINISH_GAP_SEC,
  SLOW_MOTION_RATE,
  duckMarkers,
  duckProgressAt,
  duckRaceCues,
  duckRaceDuration,
  duckRaceLosers,
  duckStandings,
  maxDuckLoserCount,
  photoFinishFocus,
  photoZoomAt,
  planDuckRace,
  slowMotionWarp,
  warpToRace,
  warpToReal,
  type DuckPlan,
  type DuckRace,
} from "./duck-race";

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

const names = (count: number) => Array.from({ length: count }, (_, i) => `duck${i}`);

/** Every field size and a spread of payer counts, several seeds each. */
function* races(seeds = 6): Generator<{ race: DuckRace; order: string[]; payers: number }> {
  for (let count = 2; count <= 24; count++) {
    for (let payers = 1; payers < count; payers += Math.max(1, Math.floor(count / 4))) {
      for (let seed = 1; seed <= seeds; seed++) {
        const order = names(count);
        yield {
          race: planDuckRace(order, seeded(seed * 131 + count * 7 + payers), payers),
          order,
          payers,
        };
      }
    }
  }
}

function duckOf(race: DuckRace, uid: string): DuckPlan {
  const duck = race.ducks.find((candidate) => candidate.uid === uid);
  if (!duck) throw new Error(`no duck ${uid}`);
  return duck;
}

describe("duckRaceDuration", () => {
  it("is never shorter than seven or longer than eleven seconds", () => {
    for (let count = 1; count <= 40; count++) {
      const seconds = duckRaceDuration(count);
      expect(seconds).toBeGreaterThanOrEqual(7);
      expect(seconds).toBeLessThanOrEqual(11);
    }
  });
});

describe("planDuckRace", () => {
  it("finishes the ducks strictly in the order given, for every field size", () => {
    for (let count = 2; count <= 32; count++) {
      for (let seed = 1; seed <= 12; seed++) {
        const order = names(count);
        const race = planDuckRace(order, seeded(seed * 31 + count), 1 + (seed % count));
        expect(race.ducks.map((duck) => duck.uid)).toEqual(order);
        for (let i = 1; i < race.ducks.length; i++) {
          expect(race.ducks[i].finishSec).toBeGreaterThan(race.ducks[i - 1].finishSec);
          expect(race.ducks[i].finishSec - race.ducks[i - 1].finishSec).toBeGreaterThanOrEqual(
            MIN_FINISH_GAP_SEC - 1e-9,
          );
        }
      }
    }
  });

  it("gives every duck a progress run that never goes backwards and ends on the line", () => {
    for (const { race } of races(2)) {
      for (const duck of race.ducks) {
        expect(duck.progress).toHaveLength(DUCK_PROGRESS_STEPS + 1);
        expect(duck.progress[0]).toBe(0);
        expect(duck.progress[duck.progress.length - 1]).toBe(1);
        for (let i = 1; i < duck.progress.length; i++) {
          expect(duck.progress[i]).toBeGreaterThan(duck.progress[i - 1]);
        }
      }
    }
  });

  it("ends when the last duck is home", () => {
    const race = planDuckRace(names(6), seeded(3));
    expect(race.totalSec).toBe(race.ducks[race.ducks.length - 1].finishSec);
    for (const duck of race.ducks) expect(duck.finishSec).toBeLessThanOrEqual(race.totalSec);
  });

  it("numbers the places from zero", () => {
    const race = planDuckRace(names(5), seeded(1));
    expect(race.ducks.map((duck) => duck.rank)).toEqual([0, 1, 2, 3, 4]);
  });

  it("is repeatable for the same random source", () => {
    expect(planDuckRace(names(8), seeded(99), 2)).toEqual(planDuckRace(names(8), seeded(99), 2));
  });

  it("varies the staging between races so no two look alike", () => {
    const a = planDuckRace(names(8), seeded(1));
    const b = planDuckRace(names(8), seeded(2));
    expect(a.ducks[3].progress).not.toEqual(b.ducks[3].progress);
  });

  it("copes with a single duck", () => {
    const race = planDuckRace(["solo"], seeded(1));
    expect(race.ducks).toHaveLength(1);
    expect(race.totalSec).toBe(race.ducks[0].finishSec);
    expect(race.photo).toBeNull();
    expect(race.warp).toEqual(IDENTITY_WARP);
  });

  it("plans nothing for nobody", () => {
    expect(planDuckRace([], seeded(1))).toEqual({
      ducks: [],
      totalSec: 0,
      photo: null,
      warp: IDENTITY_WARP,
    });
  });
});

describe("the photo finish", () => {
  it("is between the last duck that stays dry and the first one that pays, a beak apart", () => {
    for (const { race, order, payers } of races()) {
      const photo = race.photo;
      expect(photo).not.toBeNull();
      if (!photo) continue;
      expect(photo.safeUid).toBe(order[order.length - payers - 1]);
      expect(photo.payerUid).toBe(order[order.length - payers]);
      // The payer really is a payer, and the safe duck really isn't.
      expect(duckRaceLosers(order, payers)).toContain(photo.payerUid);
      expect(duckRaceLosers(order, payers)).not.toContain(photo.safeUid);
      const safe = duckOf(race, photo.safeUid);
      const payer = duckOf(race, photo.payerUid);
      expect(photo.atSec).toBe(safe.finishSec);
      expect(payer.finishSec - safe.finishSec).toBeCloseTo(PHOTO_FINISH_GAP_SEC, 9);
    }
  });

  it("brings the pair in side by side, the payer just short of the line in the photo", () => {
    for (const { race } of races()) {
      const photo = race.photo!;
      const safe = duckOf(race, photo.safeUid);
      const payer = duckOf(race, photo.payerUid);
      // Level through the slow motion, up to the flash…
      let widest = 0;
      for (let sec = photo.slowFromSec; sec <= photo.atSec; sec += 0.01) {
        widest = Math.max(widest, Math.abs(duckProgressAt(safe, sec) - duckProgressAt(payer, sec)));
      }
      expect(widest).toBeLessThan(0.06);
      // …and in the frame itself the safe duck is on the line, the payer a whisker behind.
      expect(duckProgressAt(safe, photo.atSec)).toBe(1);
      expect(photo.payerProgress).toBe(duckProgressAt(payer, photo.atSec));
      expect(photo.payerProgress).toBeLessThan(1);
      expect(photo.payerProgress).toBeGreaterThan(0.94);
    }
  });

  it("sometimes lets the payer lead on the run-in, so the lead changes hands at the end", () => {
    let flips = 0;
    let total = 0;
    for (const { race } of races()) {
      const photo = race.photo!;
      const safe = duckOf(race, photo.safeUid);
      const payer = duckOf(race, photo.payerUid);
      let payerAhead = false;
      for (let sec = safe.finishSec * 0.8; sec < photo.atSec; sec += 0.01) {
        if (duckProgressAt(payer, sec) > duckProgressAt(safe, sec)) payerAhead = true;
      }
      total += 1;
      if (payerAhead) flips += 1;
    }
    expect(flips / total).toBeGreaterThan(0.3);
    expect(flips / total).toBeLessThan(0.9);
  });

  it("doesn't make the race itself longer: the last duck is home on time, whoever pays", () => {
    for (let payers = 1; payers < 6; payers++) {
      const race = planDuckRace(names(6), seeded(5), payers);
      expect(race.totalSec).toBe(duckRaceDuration(6));
    }
  });
});

describe("duckProgressAt", () => {
  it("never goes backwards, from the gun to the line", () => {
    // One assertion per duck: a few million `expect`s would take longer than the race.
    for (const { race } of races(2)) {
      for (const duck of race.ducks) {
        let previous = 0;
        let worstStep = 0;
        let outside = 0;
        for (let sec = 0; sec <= duck.finishSec + 0.2; sec += duck.finishSec / 400) {
          const progress = duckProgressAt(duck, sec);
          worstStep = Math.min(worstStep, progress - previous);
          if (progress < 0 || progress > 1) outside += 1;
          previous = progress;
        }
        expect(worstStep).toBeGreaterThanOrEqual(-1e-12);
        expect(outside).toBe(0);
      }
    }
  });

  it("passes through every keyframe on time, starting still and ending on the line", () => {
    const race = planDuckRace(names(7), seeded(11), 2);
    for (const duck of race.ducks) {
      duck.progress.forEach((progress, index) => {
        const sec = (index / DUCK_PROGRESS_STEPS) * duck.finishSec;
        expect(duckProgressAt(duck, sec)).toBeCloseTo(progress, 9);
      });
      expect(duckProgressAt(duck, -1)).toBe(0);
      expect(duckProgressAt(duck, duck.finishSec)).toBe(1);
      expect(duckProgressAt(duck, duck.finishSec + 3)).toBe(1);
    }
  });
});

describe("the slow-motion warp", () => {
  it("is strictly monotone both ways and inverts cleanly", () => {
    const warp = slowMotionWarp(6.4, 7.1);
    let previousReal = -Infinity;
    for (let race = 0; race <= 12; race += 0.01) {
      const real = warpToReal(warp, race);
      expect(real).toBeGreaterThan(previousReal);
      expect(warpToRace(warp, real)).toBeCloseTo(race, 9);
      previousReal = real;
    }
  });

  it("runs 1:1 before the ease-in and after the ease-out, and at the slow rate in between", () => {
    const warp = slowMotionWarp(6.4, 7.1);
    const slope = (race: number) =>
      (warpToReal(warp, race + 0.001) - warpToReal(warp, race)) / 0.001;
    expect(warpToReal(warp, 3)).toBeCloseTo(3, 9);
    expect(slope(5)).toBeCloseTo(1, 6);
    expect(slope(6.6)).toBeCloseTo(1 / SLOW_MOTION_RATE, 6);
    expect(slope(9)).toBeCloseTo(1, 6);
  });

  it("keeps the order on the screen clock and makes the race at most two seconds longer", () => {
    for (const { race } of races()) {
      const cues = duckRaceCues(race);
      expect(cues.finishes.map((finish) => finish.uid)).toEqual(race.ducks.map((duck) => duck.uid));
      for (let i = 1; i < cues.finishes.length; i++) {
        expect(cues.finishes[i].atSec).toBeGreaterThan(cues.finishes[i - 1].atSec);
      }
      const longer = cues.endSec - race.totalSec;
      expect(longer).toBeGreaterThan(1);
      expect(longer).toBeLessThanOrEqual(2);
    }
  });

  it("leaves a race without a photo alone", () => {
    expect(warpToReal(IDENTITY_WARP, 4.2)).toBe(4.2);
    expect(warpToRace(IDENTITY_WARP, 4.2)).toBe(4.2);
  });
});

describe("duckRaceCues", () => {
  it("puts the flash on the safe duck's crossing, inside the slow motion, before the payer's", () => {
    for (const { race } of races(2)) {
      const cues = duckRaceCues(race);
      const photo = cues.photo!;
      const crossing = (uid: string) => cues.finishes.find((finish) => finish.uid === uid)!.atSec;
      expect(photo.flashSec).toBe(crossing(race.photo!.safeUid));
      expect(photo.payerSec).toBe(crossing(race.photo!.payerUid));
      expect(photo.slowFromSec).toBeLessThan(photo.flashSec);
      expect(photo.flashSec).toBeLessThan(photo.payerSec);
      expect(photo.payerSec).toBeLessThan(photo.slowToSec);
      // Half a second or so on screen between the two beaks touching the line.
      expect(photo.payerSec - photo.flashSec).toBeCloseTo(
        PHOTO_FINISH_GAP_SEC / SLOW_MOTION_RATE,
        6,
      );
      expect(cues.endSec).toBe(cues.finishes[cues.finishes.length - 1].atSec);
      expect(cues.settledSec).toBeGreaterThanOrEqual(cues.endSec);
      expect(cues.settledSec).toBeGreaterThanOrEqual(photo.zoomOutEndSec);
    }
  });

  it("zooms in for the slow motion, holds through both crossings and pulls back out", () => {
    const race = planDuckRace(names(4), seeded(8), 1);
    const cues = duckRaceCues(race);
    const photo = cues.photo!;
    expect(photoZoomAt(cues, 0)).toBe(0);
    expect(photoZoomAt(cues, photo.slowFromSec)).toBe(0);
    expect(photoZoomAt(cues, photo.flashSec)).toBe(1);
    expect(photoZoomAt(cues, photo.payerSec)).toBe(1);
    expect(photoZoomAt(cues, photo.zoomOutEndSec)).toBe(0);
    expect(photoZoomAt(cues, cues.settledSec + 5)).toBe(0);
  });
});

describe("photoFinishFocus", () => {
  it("keeps both lanes of the pair on screen, at any zoom it picks", () => {
    for (let count = 2; count <= 24; count++) {
      for (let a = 0; a < count; a++) {
        for (let b = 0; b < count; b++) {
          if (a === b) continue;
          const { scale, originX } = photoFinishFocus(count, a, b);
          expect(scale).toBeGreaterThanOrEqual(1);
          expect(scale).toBeLessThanOrEqual(1.7 + 1e-9);
          expect(originX).toBeGreaterThanOrEqual(0);
          expect(originX).toBeLessThanOrEqual(1);
          if (scale === 1) continue;
          for (const lane of [a, b]) {
            const shown = originX + scale * ((lane + 0.5) / count - originX);
            expect(shown).toBeGreaterThanOrEqual(0.14 - 1e-9);
            expect(shown).toBeLessThanOrEqual(0.86 + 1e-9);
          }
        }
      }
    }
  });

  it("zooms all the way in on neighbours in a big field, and not at all on the two outside lanes", () => {
    expect(photoFinishFocus(12, 5, 6).scale).toBeCloseTo(1.7, 9);
    expect(photoFinishFocus(12, 0, 11).scale).toBe(1);
  });
});

describe("duckStandings and duckMarkers", () => {
  it("end exactly on the finishing order: the lanterns hang over the payers, the crown over the winner", () => {
    for (const { race, order, payers } of races(2)) {
      expect(duckStandings(race, race.totalSec, order)).toEqual(order);
      const markers = duckMarkers(race, race.totalSec, order, payers);
      expect(markers.leader).toBe(order[0]);
      expect([...markers.lanterns].sort()).toEqual([...duckRaceLosers(order, payers)].sort());
    }
  });

  it("give nothing away on the start line: ties go by lane, not by place", () => {
    const order = names(5);
    const lanes = ["duck3", "duck0", "duck4", "duck1", "duck2"];
    const race = planDuckRace(order, seeded(4), 1);
    expect(duckStandings(race, 0, lanes)).toEqual(lanes);
  });

  it("put the ducks already home in front, in the order they crossed", () => {
    const order = names(6);
    const race = planDuckRace(order, seeded(6), 2);
    const sec = race.ducks[2].finishSec + 0.01;
    const standings = duckStandings(race, sec, order);
    expect(standings.slice(0, 3)).toEqual(order.slice(0, 3));
    expect([...standings.slice(3)].sort()).toEqual(order.slice(3));
  });

  it("follow the picture mid-race and always hang one lantern per payer", () => {
    const order = names(6);
    const race = planDuckRace(order, seeded(12), 2);
    for (let sec = 0.5; sec < race.totalSec; sec += 0.25) {
      const standings = duckStandings(race, sec, order);
      const progress = standings.map((uid) => duckProgressAt(duckOf(race, uid), sec));
      for (let i = 1; i < progress.length; i++) {
        expect(progress[i]).toBeLessThanOrEqual(progress[i - 1]);
      }
      const markers = duckMarkers(race, sec, order, 2);
      expect(markers.lanterns).toEqual(standings.slice(4));
      expect(markers.leader).toBe(standings[0]);
    }
  });
});

describe("duckRaceLosers", () => {
  it("makes the last duck across the line pay, last place first", () => {
    expect(duckRaceLosers(["a", "b", "c", "d"], 1)).toEqual(["d"]);
    expect(duckRaceLosers(["a", "b", "c", "d"], 2)).toEqual(["d", "c"]);
  });

  it("always keeps the winner dry", () => {
    expect(maxDuckLoserCount(2)).toBe(1);
    expect(duckRaceLosers(["a", "b", "c"], 99)).toEqual(["c", "b"]);
    expect(duckRaceLosers(["a", "b", "c"], 0)).toEqual(["c"]);
  });
});
