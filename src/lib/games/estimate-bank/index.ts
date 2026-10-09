import "server-only";
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";

/**
 * The Schätzfragen question bank — plaintext rows in a PUBLIC repository.
 * `server-only` keeps the truths out of client bundles and client-readable
 * documents, nothing more (docs/DECISIONS.md, ADR-006). This is the only file
 * that would change if the owner ever wants a sealed bank: decrypt here, export
 * the same frozen array.
 *
 * Imported by `src/lib/actions/estimate-rounds.ts` and tests only (ESLint,
 * eslint.config.mjs). The rows arrive in `rows/*.ts`, one file per category,
 * each starting with `import "server-only"`; until the first batch lands the
 * bank is empty.
 */
export const ESTIMATE_BANK: readonly EstimateQuestion[] = Object.freeze<EstimateQuestion[]>([]);

export const ESTIMATE_BANK_BY_ID: ReadonlyMap<string, EstimateQuestion> = new Map(
  ESTIMATE_BANK.map((row) => [row.id, row]),
);

export { RETIRED_IDS } from "@/lib/games/estimate-bank/types";
