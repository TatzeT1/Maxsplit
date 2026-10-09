import { afterEach, describe, expect, it, vi } from "vitest";
import {
  drawEstimateQuestion,
  EstimatePoolEmptyError,
  hasEligibleStechfrage,
  type EstimateDrawInput,
} from "@/lib/games/estimate-bank/draw";
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";
import { ESTIMATE_FIXTURE_BANK, makeEstimateRow } from "@/test/estimate-bank-fixture";

const identity = <T>(items: T[]): T[] => items;
const reversed = <T>(items: T[]): T[] => [...items].reverse();

/** Mulberry32: a seeded PRNG, so no test ever touches `Math.random`. */
function seededShuffle(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
}

const BANK = ESTIMATE_FIXTURE_BANK;
const STANDARD = BANK.filter((row) => row.tone === "standard");
const FUN = BANK.filter((row) => row.tone === "fun");

function input(overrides: Partial<EstimateDrawInput> = {}): EstimateDrawInput {
  return { bank: BANK, seen: [], includeFun: false, exclude: [], shuffle: identity, ...overrides };
}

/** Draws `count` times in a row, feeding each seen-set into the next draw. */
function drawMany(count: number, overrides: Partial<EstimateDrawInput> = {}) {
  let seen: string[] = overrides.seen ? [...overrides.seen] : [];
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = drawEstimateQuestion(input({ ...overrides, seen }));
    seen = result.seen;
    results.push(result);
  }
  return results;
}

/** A tolerance-free bank of `count` standard rows, ids est-geo-8001.. */
function bankOf(
  count: number,
  overrides: (index: number) => Partial<EstimateQuestion> = () => ({}),
) {
  return Array.from({ length: count }, (_, index) =>
    makeEstimateRow({ id: `est-geo-${8001 + index}`, ...overrides(index) }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("drawEstimateQuestion", () => {
  it("never repeats before the pool is exhausted, then resets", () => {
    const results = drawMany(STANDARD.length + 1, { shuffle: seededShuffle(1) });
    const first = results.slice(0, STANDARD.length);
    expect(new Set(first.map((r) => r.question.id)).size).toBe(STANDARD.length);
    expect(first.every((r) => !r.reset)).toBe(true);
    expect(results[STANDARD.length].reset).toBe(true);
  });

  it("returns the seen-set to store: the old ids plus the drawn one, no duplicates", () => {
    const [a, b] = drawMany(2, { shuffle: seededShuffle(2) });
    expect(a.seen).toEqual([a.question.id]);
    expect(b.seen).toEqual([a.question.id, b.question.id]);
  });

  it("honours the tone filter, also after a reset", () => {
    for (const result of drawMany(STANDARD.length * 2 + 3, { shuffle: seededShuffle(3) })) {
      expect(result.question.tone).toBe("standard");
    }
  });

  it("draws fun rows only when asked to", () => {
    const tones = new Set(
      drawMany(BANK.length, { includeFun: true, shuffle: seededShuffle(4) }).map(
        (r) => r.question.tone,
      ),
    );
    expect(tones).toEqual(new Set(["standard", "fun"]));
  });

  it("honours exclude, also on a reset (a Stechfrage never repeats an earlier question of its round)", () => {
    const exclude = [STANDARD[0].id, STANDARD[1].id];
    const results = drawMany(STANDARD.length * 2, { exclude, shuffle: seededShuffle(5) });
    for (const result of results) expect(exclude).not.toContain(result.question.id);
    expect(results.some((r) => r.reset)).toBe(true);
  });

  it("prunes ids the bank no longer knows", () => {
    const { seen } = drawEstimateQuestion(
      input({ seen: ["est-geo-0001", STANDARD[0].id, "retired-id"] }),
    );
    expect(seen).not.toContain("est-geo-0001");
    expect(seen).not.toContain("retired-id");
    expect(seen[0]).toBe(STANDARD[0].id);
  });

  it("collapses duplicate ids in a stored seen-set", () => {
    const { seen } = drawEstimateQuestion(
      input({ seen: [STANDARD[0].id, STANDARD[1].id, STANDARD[0].id] }),
    );
    expect(seen.filter((id) => id === STANDARD[0].id)).toHaveLength(1);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("treats a missing seen-set as empty", () => {
    expect(drawEstimateQuestion(input({ seen: [] })).reset).toBe(false);
  });

  it("uses only the injected shuffle: a spy proves no Math.random, and the shuffle decides", () => {
    const random = vi.spyOn(Math, "random");
    const fromFront = drawEstimateQuestion(input({ shuffle: identity })).question.id;
    const fromBack = drawEstimateQuestion(input({ shuffle: reversed })).question.id;
    expect(fromFront).toBe(STANDARD[0].id);
    expect(fromBack).toBe(STANDARD[STANDARD.length - 1].id);
    expect(random).not.toHaveBeenCalled();
  });

  it("hands the shuffle the pool and does not mutate its inputs", () => {
    const bank = [...BANK];
    const seen = [STANDARD[0].id];
    const seenBefore = [...seen];
    let calls = 0;
    const shuffle: EstimateDrawInput["shuffle"] = (items) => {
      calls += 1;
      return items;
    };
    drawEstimateQuestion(input({ bank, seen, shuffle }));
    expect(calls).toBe(1);
    expect(bank).toEqual([...BANK]);
    expect(seen).toEqual(seenBefore);
  });

  describe("preferNoTolerance", () => {
    const toleranceIds = new Set(BANK.filter((row) => row.tolerance).map((row) => row.id));

    it("draws a tolerance-free question while one is left", () => {
      expect(toleranceIds.size).toBeGreaterThan(0);
      for (let seed = 1; seed <= 25; seed++) {
        const { question } = drawEstimateQuestion(
          input({ preferNoTolerance: true, shuffle: seededShuffle(seed) }),
        );
        expect(toleranceIds.has(question.id), question.id).toBe(false);
      }
    });

    it("falls back to a tolerance row when none without one is left", () => {
      const withTolerance = STANDARD.filter((row) => row.tolerance);
      const { question } = drawEstimateQuestion(
        input({ bank: withTolerance, preferNoTolerance: true }),
      );
      expect(toleranceIds.has(question.id)).toBe(true);
    });

    it("is off by default", () => {
      const tolerant = STANDARD.filter((row) => row.tolerance);
      const noTolerance = STANDARD.filter((row) => !row.tolerance);
      const bank = [...tolerant, ...noTolerance];
      expect(drawEstimateQuestion(input({ bank })).question.id).toBe(tolerant[0].id);
    });
  });

  describe("after a reset", () => {
    it("does not draw the question played last right away (pool of 8 or more)", () => {
      const bank = bankOf(12);
      for (let seed = 1; seed <= 40; seed++) {
        const shuffle = seededShuffle(seed);
        let seen: string[] = [];
        for (let i = 0; i < bank.length; i++) {
          seen = drawEstimateQuestion(input({ bank, seen, shuffle })).seen;
        }
        const lastThree = seen.slice(-3);
        const result = drawEstimateQuestion(input({ bank, seen, shuffle }));
        expect(result.reset).toBe(true);
        expect(lastThree, `seed ${seed}`).not.toContain(result.question.id);
      }
    });

    it("keeps the most recent ids and forgets the rest", () => {
      const bank = bankOf(12);
      const all = bank.map((row) => row.id);
      const result = drawEstimateQuestion(input({ bank, seen: all }));
      expect(result.reset).toBe(true);
      // floor(12 / 4) = 3 recent ids stay "seen"; the new question joins them
      expect(result.seen).toHaveLength(4);
      expect(result.seen.slice(0, 3)).toEqual(all.slice(-3));
      expect(result.seen[3]).toBe(result.question.id);
    });

    it("keeps at most ten recent ids", () => {
      const bank = bankOf(60);
      const result = drawEstimateQuestion(input({ bank, seen: bank.map((row) => row.id) }));
      expect(result.seen).toHaveLength(11);
    });

    it("keeps no recent id for a bank of fewer than 4 eligible rows", () => {
      const bank = bankOf(3);
      const result = drawEstimateQuestion(input({ bank, seen: bank.map((row) => row.id) }));
      expect(result.reset).toBe(true);
      expect(result.seen).toEqual([result.question.id]);
    });

    it("does not forget which rows of the other tone were seen", () => {
      const standardIds = STANDARD.map((row) => row.id);
      const funSeen = [FUN[0].id, FUN[1].id];
      const result = drawEstimateQuestion(input({ seen: [...funSeen, ...standardIds] }));
      expect(result.reset).toBe(true);
      expect(result.seen).toEqual(expect.arrayContaining(funSeen));
    });

    it("forgets the standard rows only, so the fun pool is not restarted by a standard reset", () => {
      const standardIds = STANDARD.map((row) => row.id);
      const result = drawEstimateQuestion(
        input({ seen: [...FUN.map((r) => r.id), ...standardIds] }),
      );
      const recent = Math.floor(STANDARD.length / 4);
      expect(result.seen).toHaveLength(FUN.length + recent + 1);
    });
  });

  it("throws EstimatePoolEmptyError for an empty bank", () => {
    expect(() => drawEstimateQuestion(input({ bank: [] }))).toThrow(EstimatePoolEmptyError);
  });

  it("throws when only fun rows exist and fun is off", () => {
    expect(() => drawEstimateQuestion(input({ bank: FUN }))).toThrow(EstimatePoolEmptyError);
    expect(drawEstimateQuestion(input({ bank: FUN, includeFun: true })).question.tone).toBe("fun");
  });

  it("throws exactly when hasEligibleStechfrage turns false", () => {
    const bank = bankOf(1);
    const onlyRow = bank[0].id;
    expect(hasEligibleStechfrage({ bank, includeFun: false, exclude: [] })).toBe(true);
    expect(drawEstimateQuestion(input({ bank })).question.id).toBe(onlyRow);

    expect(hasEligibleStechfrage({ bank, includeFun: false, exclude: [onlyRow] })).toBe(false);
    expect(() => drawEstimateQuestion(input({ bank, exclude: [onlyRow] }))).toThrow(
      EstimatePoolEmptyError,
    );
  });

  it("is an Error with a name, so a catch block can tell it from a bug", () => {
    const error = new EstimatePoolEmptyError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EstimatePoolEmptyError");
  });
});

describe("hasEligibleStechfrage", () => {
  it("ignores the seen-set: a seen row is still eligible after a reset", () => {
    expect(hasEligibleStechfrage({ bank: BANK, includeFun: false, exclude: [] })).toBe(true);
  });

  it("counts fun rows only when fun is on", () => {
    const standardIds = STANDARD.map((row) => row.id);
    expect(hasEligibleStechfrage({ bank: BANK, includeFun: false, exclude: standardIds })).toBe(
      false,
    );
    expect(hasEligibleStechfrage({ bank: BANK, includeFun: true, exclude: standardIds })).toBe(
      true,
    );
  });

  it("is false for an empty bank", () => {
    expect(hasEligibleStechfrage({ bank: [], includeFun: true, exclude: [] })).toBe(false);
  });
});
