import "server-only";
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";
import { GEOGRAPHY_ROWS } from "./rows/geography";
import { NATURE_ROWS } from "./rows/nature";
import { ANIMALS_ROWS } from "./rows/animals";
import { BODY_ROWS } from "./rows/body";
import { EVERYDAY_ROWS } from "./rows/everyday";
import { SPACE_ROWS } from "./rows/space";
import { CULTURE_ROWS } from "./rows/culture";
import { FOOD_ROWS } from "./rows/food";
import { HISTORY_ROWS } from "./rows/history";
import { SCIENCE_ROWS } from "./rows/science";
import { SPORT_ROWS } from "./rows/sport";
import { TECHNOLOGY_ROWS } from "./rows/technology";

/**
 * The Schätzfragen question bank — plaintext rows in a PUBLIC repository.
 * `server-only` keeps the truths out of client bundles and client-readable
 * documents, nothing more (docs/DECISIONS.md, ADR-007). This is the only file
 * that would change if the owner ever wants a sealed bank: decrypt here, export
 * the same frozen array.
 *
 * Imported by `src/lib/actions/estimate-rounds.ts` and tests only (ESLint,
 * eslint.config.mjs). The rows arrive in `rows/*.ts`, one file per category,
 * each starting with `import "server-only"`. The rows are generated from
 * researched and blind-checked material and are not yet human-approved
 * (docs/estimate-bank-review.md).
 */
export const ESTIMATE_BANK: readonly EstimateQuestion[] = Object.freeze<EstimateQuestion[]>([
  ...GEOGRAPHY_ROWS,
  ...NATURE_ROWS,
  ...ANIMALS_ROWS,
  ...BODY_ROWS,
  ...EVERYDAY_ROWS,
  ...SPACE_ROWS,
  ...CULTURE_ROWS,
  ...FOOD_ROWS,
  ...HISTORY_ROWS,
  ...SCIENCE_ROWS,
  ...SPORT_ROWS,
  ...TECHNOLOGY_ROWS,
]);

export const ESTIMATE_BANK_BY_ID: ReadonlyMap<string, EstimateQuestion> = new Map(
  ESTIMATE_BANK.map((row) => [row.id, row]),
);

export { RETIRED_IDS } from "@/lib/games/estimate-bank/types";
