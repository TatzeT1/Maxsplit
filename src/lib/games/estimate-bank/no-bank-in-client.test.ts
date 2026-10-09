// @vitest-environment node
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The lint guard of docs/DECISIONS.md ADR-006 (spec D.7, layer 2): the real
 * eslint.config.mjs, run over snippets that pretend to live at a given path.
 * If someone loosens the `no-restricted-imports` blocks, this fails.
 */
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function restrictedMessages(filePath: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${source}\nexport {};\n`, { filePath });
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.message);
}

const BANK = 'import { ESTIMATE_BANK } from "@/lib/games/estimate-bank";';
const RULES = 'import { classifyEstimate } from "@/lib/games/estimate-rules";';
const AUDIT = 'import { buildEstimateAudit } from "@/lib/games/estimate-audit";';
const TIMEOUT = 60_000;

describe("the question bank stays out of client code", () => {
  it(
    "reports a bank import from a component",
    async () => {
      const messages = await restrictedMessages("src/components/groups/x.tsx", BANK);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/server-only/);
      expect(messages[0]).toMatch(/estimate-bank\/types/);
    },
    TIMEOUT,
  );

  it(
    "does not report the same import in the estimate actions",
    async () => {
      expect(await restrictedMessages("src/lib/actions/estimate-rounds.ts", BANK)).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "does not report a type import from estimate-bank/types, nor the data-free modules",
    async () => {
      const file = "src/components/groups/x.tsx";
      for (const source of [
        'import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";',
        'import { ESTIMATE_BOUNDS } from "@/lib/games/estimate-bank/types";',
        'import { decimalToMilli } from "@/lib/games/estimate-bank/public";',
        'import { drawEstimateQuestion } from "@/lib/games/estimate-bank/draw";',
        'import { validateEstimateBank } from "@/lib/games/estimate-bank/validate";',
      ]) {
        expect(await restrictedMessages(file, source), source).toEqual([]);
      }
    },
    TIMEOUT,
  );

  it(
    "reports the index and the rows in every spelling",
    async () => {
      const file = "src/components/groups/x.tsx";
      for (const source of [
        'import { A } from "@/lib/games/estimate-bank/index";',
        'import { A } from "@/lib/games/estimate-bank/rows/geography";',
        'import type { A } from "@/lib/games/estimate-bank";',
        'import { A } from "../../lib/games/estimate-bank";',
        'import { A } from "../../lib/games/estimate-bank/rows/space";',
      ]) {
        expect(await restrictedMessages(file, source), source).toHaveLength(1);
      }
    },
    TIMEOUT,
  );

  it(
    "reports a relative bank import from a hook and a bank import from a server component",
    async () => {
      expect(
        await restrictedMessages(
          "src/lib/games/use-x.ts",
          'import { ESTIMATE_BANK } from "./estimate-bank/index";',
        ),
      ).toHaveLength(1);
      expect(
        await restrictedMessages(
          "src/lib/games/use-x.ts",
          'import { ESTIMATE_BANK } from "../games/estimate-bank";',
        ),
      ).toHaveLength(1);
      expect(await restrictedMessages("src/app/(app)/x/page.tsx", BANK)).toHaveLength(1);
    },
    TIMEOUT,
  );

  it(
    "keeps the client-safe rules modules away from the bank too",
    async () => {
      expect(await restrictedMessages("src/lib/games/estimate-input.ts", BANK)).toHaveLength(1);
      expect(await restrictedMessages("src/lib/games/estimate-axis.ts", BANK)).toHaveLength(1);
      expect(await restrictedMessages("src/lib/games/estimate-rules.ts", BANK)).toHaveLength(1);
      // ... while the data-free half is fine for them
      expect(
        await restrictedMessages(
          "src/lib/games/estimate-rules.ts",
          'import { decimalToMilli } from "@/lib/games/estimate-bank/public";',
        ),
      ).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "lets tests and the bank itself import the rows",
    async () => {
      expect(await restrictedMessages("src/components/groups/x.test.tsx", BANK)).toEqual([]);
      expect(await restrictedMessages("src/lib/games/estimate-bank/bank.test.ts", BANK)).toEqual(
        [],
      );
      expect(await restrictedMessages("src/test/estimate-bank-fixture.ts", BANK)).toEqual([]);
      expect(
        await restrictedMessages(
          "src/lib/games/estimate-bank/draw.ts",
          'import { ESTIMATE_BANK } from "./index";',
        ),
      ).toEqual([]);
    },
    TIMEOUT,
  );
});

describe("the classifier stays out of the initial chunks", () => {
  it(
    "reports estimate-rules and estimate-audit imported from a component, a page or a hook",
    async () => {
      for (const file of [
        "src/components/groups/x.tsx",
        "src/components/groups/split-game/estimate/estimate-reveal.tsx",
        "src/app/(app)/groups/[groupId]/page.tsx",
      ]) {
        const rules = await restrictedMessages(file, RULES);
        expect(rules, file).toHaveLength(1);
        expect(rules[0]).toMatch(/audit table/);
        expect(await restrictedMessages(file, AUDIT), file).toHaveLength(1);
      }
      expect(await restrictedMessages("src/lib/games/use-x.ts", RULES)).toHaveLength(1);
      expect(
        await restrictedMessages(
          "src/lib/games/use-x.ts",
          'import { classifyEstimate } from "./estimate-rules";',
        ),
      ).toHaveLength(1);
    },
    TIMEOUT,
  );

  it(
    "allows the lazily loaded audit table to import them, but still not the bank",
    async () => {
      const file = "src/components/groups/split-game/estimate/estimate-audit.tsx";
      expect(await restrictedMessages(file, RULES)).toEqual([]);
      expect(await restrictedMessages(file, AUDIT)).toEqual([]);
      expect(await restrictedMessages(file, BANK)).toHaveLength(1);
    },
    TIMEOUT,
  );

  it(
    "does not mistake the audit component for the audit module",
    async () => {
      expect(
        await restrictedMessages(
          "src/components/groups/split-game/game-record.tsx",
          'import { EstimateAuditTable } from "./estimate/estimate-audit";',
        ),
      ).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "leaves the server, the pure modules and tests free to import them",
    async () => {
      expect(await restrictedMessages("src/lib/actions/estimate-rounds.ts", RULES)).toEqual([]);
      expect(await restrictedMessages("src/lib/games/estimate-audit.ts", RULES)).toEqual([]);
      expect(await restrictedMessages("src/components/groups/x.test.tsx", RULES)).toEqual([]);
    },
    TIMEOUT,
  );
});
