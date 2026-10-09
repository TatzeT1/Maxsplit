import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

// The Schätzfragen question bank holds the truths of its questions. It must
// never reach a client bundle or an RSC payload (docs/DECISIONS.md, ADR-006):
//   - `estimate-bank/index` and `estimate-bank/rows/*` are server-only modules
//     that carry data; only the estimate actions and tests may import them.
//     `estimate-bank/types`, `public`, `draw` and `validate` are data-free and
//     stay importable.
//   - `estimate-rules` and `estimate-audit` are the classifier and the audit
//     replay; they stay out of components, pages and hooks (and so out of the
//     group page's initial chunk) except in the lazily loaded audit table.
// `no-restricted-imports` is ONE rule: a later block for the same file REPLACES
// the options of an earlier one, so every block below repeats the bank patterns.
// Patterns are regexes on the import specifier because gitignore-style globs
// also match everything below a directory, which would ban `estimate-bank/types`.
const BANK_MESSAGE =
  "The question bank is server-only: import types from estimate-bank/types, and leave the rows to src/lib/actions/estimate-rounds.ts.";
const BANK_PATTERN = {
  // "@/lib/games/estimate-bank", ".../estimate-bank/index", ".../estimate-bank/rows/x" — also spelled relatively ("../estimate-bank").
  regex: String.raw`(?:^|/)estimate-bank(?:/index)?$|(?:^|/)estimate-bank/rows(?:/|$)`,
  message: BANK_MESSAGE,
};
const RULES_MESSAGE =
  "estimate-rules and estimate-audit are the server's classifier: only the lazily loaded audit table may import them. Components work with the round document, which already holds every result.";
// Spelled with the `games/` segment because a component file is itself called estimate-audit.tsx.
const RULES_PATTERN = {
  regex: String.raw`(?:^|/)games/estimate-(?:rules|audit)$`,
  message: RULES_MESSAGE,
};
// A hook next to the modules may import them relatively.
const RULES_PATTERN_RELATIVE = {
  regex: String.raw`^\./estimate-(?:rules|audit)$`,
  message: RULES_MESSAGE,
};

const TESTS = ["**/*.test.ts", "**/*.test.tsx", "src/test/**"];
const BANK_IMPORTERS = ["src/lib/actions/estimate-rounds.ts", "src/lib/games/estimate-bank/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...BANK_IMPORTERS, ...TESTS],
    rules: {
      "no-restricted-imports": ["error", { patterns: [BANK_PATTERN] }],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: [
      ...BANK_IMPORTERS,
      ...TESTS,
      // The one component that replays an audit, loaded with next/dynamic.
      "src/components/groups/split-game/estimate/estimate-audit.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [BANK_PATTERN, RULES_PATTERN] }],
    },
  },
  {
    files: ["src/lib/games/use-*.ts"],
    ignores: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [BANK_PATTERN, RULES_PATTERN, RULES_PATTERN_RELATIVE] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
