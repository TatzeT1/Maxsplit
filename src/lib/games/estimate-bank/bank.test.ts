import { describe, expect, it } from "vitest";
import { ESTIMATE_BANK, ESTIMATE_BANK_BY_ID, RETIRED_IDS } from "@/lib/games/estimate-bank";
import { ESTIMATE_CATEGORIES } from "@/lib/games/estimate-bank/types";
import { validateEstimateBank } from "@/lib/games/estimate-bank/validate";

/**
 * The content gate: every row of the real bank goes through the validator in
 * the default `pnpm test`. The minimum bank size is NOT checked here — that is
 * `pnpm check:bank-floors` (bank-floors.test.ts) — so the guards can land
 * before the content without reddening every other package.
 */
describe("the real question bank", () => {
  it("passes validateEstimateBank (floors off)", () => {
    const problems = validateEstimateBank(ESTIMATE_BANK, { floors: false });
    expect(
      problems,
      problems.map((problem) => `${problem.id} [${problem.rule}] ${problem.message}`).join("\n"),
    ).toEqual([]);
  });

  it("is a frozen array", () => {
    expect(Array.isArray(ESTIMATE_BANK)).toBe(true);
    expect(Object.isFrozen(ESTIMATE_BANK)).toBe(true);
  });

  it("is indexed by id, every row once", () => {
    expect(ESTIMATE_BANK_BY_ID.size).toBe(ESTIMATE_BANK.length);
    for (const row of ESTIMATE_BANK) expect(ESTIMATE_BANK_BY_ID.get(row.id)).toBe(row);
  });

  it("uses no retired id", () => {
    const ids = new Set(ESTIMATE_BANK.map((row) => row.id));
    for (const retired of RETIRED_IDS) expect(ids.has(retired), retired).toBe(false);
  });

  it("splits into categories, tones and scales that add up", () => {
    const count = (pick: (row: (typeof ESTIMATE_BANK)[number]) => string) =>
      Object.values(
        ESTIMATE_BANK.reduce<Record<string, number>>((counts, row) => {
          counts[pick(row)] = (counts[pick(row)] ?? 0) + 1;
          return counts;
        }, {}),
      ).reduce((sum, n) => sum + n, 0);
    expect(count((row) => row.category)).toBe(ESTIMATE_BANK.length);
    expect(count((row) => row.tone)).toBe(ESTIMATE_BANK.length);
    expect(count((row) => row.scale)).toBe(ESTIMATE_BANK.length);
    for (const row of ESTIMATE_BANK) expect(ESTIMATE_CATEGORIES).toContain(row.category);
  });
});
