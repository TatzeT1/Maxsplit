import { describe, expect, it } from "vitest";
import { ESTIMATE_BANK } from "@/lib/games/estimate-bank";
import { validateEstimateBank } from "@/lib/games/estimate-bank/validate";

/**
 * The minimum bank size (spec D.3 `floors`): at least 100 standard and 30 fun
 * rows, a balanced mix. Run by `pnpm check:bank-floors`, which sets
 * ESTIMATE_BANK_FLOORS=1; skipped in the default `pnpm test`, so the guards
 * can land before the content (docs/DECISIONS.md ADR-006).
 */
describe.skipIf(process.env.ESTIMATE_BANK_FLOORS !== "1")("the question bank's floors", () => {
  it("meets the minimum bank size", () => {
    const problems = validateEstimateBank(ESTIMATE_BANK);
    expect(
      problems,
      problems.map((problem) => `${problem.id} [${problem.rule}] ${problem.message}`).join("\n"),
    ).toEqual([]);
  });
});
