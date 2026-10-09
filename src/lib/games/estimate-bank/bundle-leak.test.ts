// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { ESTIMATE_BANK } from "@/lib/games/estimate-bank";

/**
 * "The bank is in no client chunk" (spec I.5), run by `pnpm check:bank-leak`
 * AFTER `pnpm build`: it scans the built output, which a unit test cannot see.
 *
 * 1. Needles from the real bank (every row's id and the first characters of its
 *    editorial definition) must not appear in any client chunk under
 *    `.next/static`, and (so the scan is not vacuous) must appear under
 *    `.next/server`, where the estimate actions legitimately carry the bank.
 * 2. The group page's INITIAL JavaScript must not contain the classifier: it
 *    belongs to the dialog and audit chunks only (docs/DECISIONS.md ADR-006).
 *
 * It cannot see RSC props (ESLint covers them) and says nothing about the
 * repository itself, which is public. Skipped unless ESTIMATE_LEAK_CHECK=1:
 * a stale or half-written `.next` must not redden an ordinary `pnpm test`, and
 * CI runs the check after a fresh build.
 */
const strict = process.env.ESTIMATE_LEAK_CHECK === "1";
const NEXT_DIR = path.join(process.cwd(), ".next");
const STATIC_DIR = path.join(NEXT_DIR, "static");
const SERVER_DIR = path.join(NEXT_DIR, "server");
const GROUP_PAGE_MANIFEST = path.join(
  SERVER_DIR,
  "app",
  "(app)",
  "groups",
  "[groupId]",
  "page_client-reference-manifest.js",
);

/**
 * Strings that only the classifier carries. Production builds mangle
 * identifiers, so a function NAME is a weak needle; add a message that
 * `classifyEstimate` / `isEstimateTie` throw with when the rules land.
 */
const RULES_NEEDLES = ["classifyEstimate", "isEstimateTie"];

function walk(dir: string, extension: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

/** The longest plain prefix of `text` (at most `max` characters): free of anything a bundler might escape. */
function plainPrefix(text: string, max: number): string {
  const match = /^[A-Za-z0-9 ,.()-]*/.exec(text.slice(0, max));
  return match ? match[0] : "";
}

function needlesOf(rows: typeof ESTIMATE_BANK): { rowId: string; needle: string }[] {
  const needles: { rowId: string; needle: string }[] = [];
  for (const row of rows) {
    needles.push({ rowId: row.id, needle: row.id });
    const definition = plainPrefix(row.definition, 40);
    if (definition.length >= 12) needles.push({ rowId: row.id, needle: definition });
  }
  return needles;
}

function filesContaining(files: string[], needles: { rowId: string; needle: string }[]) {
  const hits: { file: string; rowId: string }[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const { rowId, needle } of needles) {
      if (content.includes(needle)) hits.push({ file: path.relative(NEXT_DIR, file), rowId });
    }
  }
  return hits;
}

/** The chunks a route loads before anything is lazily imported, from its client reference manifest. */
function initialChunksOf(manifestFile: string): string[] {
  const sandbox: { __RSC_MANIFEST?: Record<string, unknown> } = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(manifestFile, "utf8"), sandbox);
  const manifest = Object.values(sandbox.__RSC_MANIFEST ?? {})[0] as
    | {
        entryJSFiles?: Record<string, string[]>;
        clientModules?: Record<string, { chunks?: string[] }>;
      }
    | undefined;
  const chunks = new Set<string>();
  const add = (file: string) => {
    const normalised = file.replace(/^\/_next\//, "");
    if (normalised.endsWith(".js")) chunks.add(path.join(NEXT_DIR, normalised));
  };
  for (const files of Object.values(manifest?.entryJSFiles ?? {})) files.forEach(add);
  for (const entry of Object.values(manifest?.clientModules ?? {})) entry.chunks?.forEach(add);
  return [...chunks];
}

describe.skipIf(!strict)("the bank is in no client chunk", () => {
  it("has a build to scan", () => {
    expect(
      fs.existsSync(STATIC_DIR) && fs.existsSync(SERVER_DIR),
      "no .next build: run `pnpm build` before `pnpm check:bank-leak`",
    ).toBe(true);
  });

  const needles = needlesOf(ESTIMATE_BANK);

  it("keeps every row's needles out of .next/static", () => {
    const leaks = filesContaining(walk(STATIC_DIR, ".js"), needles);
    expect(
      leaks,
      leaks.map((leak) => `${leak.rowId} appears in client chunk ${leak.file}`).join("\n"),
    ).toEqual([]);
  });

  it("sees the bank where it legitimately lives (the scan is not vacuous)", () => {
    // An empty bank has nothing to find; the first rows make this assertion real.
    if (needles.length === 0) return;
    const hits = filesContaining(walk(SERVER_DIR, ".js"), needles);
    expect(
      hits.length,
      "no bank row found under .next/server: the scan cannot see the bank, so a pass above means nothing",
    ).toBeGreaterThan(0);
  });

  it("keeps the classifier out of the group page's initial JavaScript", () => {
    expect(
      fs.existsSync(GROUP_PAGE_MANIFEST),
      "cannot locate the group page's client reference manifest",
    ).toBe(true);
    const chunks = initialChunksOf(GROUP_PAGE_MANIFEST);
    expect(
      chunks.length,
      "the manifest lists no initial chunk: the check would be vacuous",
    ).toBeGreaterThan(0);
    const hits = filesContaining(
      chunks,
      RULES_NEEDLES.map((needle) => ({ rowId: needle, needle })),
    );
    expect(
      hits,
      hits
        .map((hit) => `${hit.rowId} appears in the group page's initial chunk ${hit.file}`)
        .join("\n"),
    ).toEqual([]);
  });
});

// The scanning itself must work, or a pass above means nothing: positive and
// negative controls on synthetic files, in every run (no build needed).
describe("the leak scan's helpers", () => {
  function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "estimate-leak-"));
  }

  it("finds a needle in a chunk, and only in that chunk", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "leaky.js"), 'var a="the quick est-geo-0001 fox";');
    fs.writeFileSync(path.join(dir, "clean.js"), 'var a="nothing to see";');
    const hits = filesContaining(walk(dir, ".js"), [
      { rowId: "est-geo-0001", needle: "est-geo-0001" },
    ]);
    expect(hits.map((hit) => path.basename(hit.file))).toEqual(["leaky.js"]);
    expect(hits[0].rowId).toBe("est-geo-0001");
  });

  it("walks nested directories and only the asked extension", () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "a", "b", "x.js"), "");
    fs.writeFileSync(path.join(dir, "a", "y.css"), "");
    expect(walk(dir, ".js").map((file) => path.basename(file))).toEqual(["x.js"]);
  });

  it("cuts a definition at the first character a bundler might escape", () => {
    expect(plainPrefix("Height of the summit above sea level (Normalhöhennull), cross", 40)).toBe(
      "Height of the summit above sea level (No",
    );
    expect(plainPrefix('Height "of" it', 40)).toBe("Height ");
    expect(plainPrefix("Short", 40)).toBe("Short");
  });

  it("builds needles from the id and the plain start of the definition", () => {
    const [row] = [
      {
        id: "est-geo-0001",
        definition: "Height of the highest summit above sea level, summit cross excluded.",
      },
    ];
    const needles = needlesOf([row] as unknown as typeof ESTIMATE_BANK);
    expect(needles.map((entry) => entry.needle)).toEqual([
      "est-geo-0001",
      "Height of the highest summit above sea l",
    ]);
  });

  it("reads the initial chunks of a route from its client reference manifest", () => {
    const dir = tempDir();
    const file = path.join(dir, "page_client-reference-manifest.js");
    fs.writeFileSync(
      file,
      [
        "globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};",
        'globalThis.__RSC_MANIFEST["/(app)/groups/[groupId]/page"] = ' +
          JSON.stringify({
            clientModules: {
              "[project]/a": {
                chunks: ["/_next/static/chunks/aaa.js", "/_next/static/chunks/style.css"],
              },
              "[project]/b": { chunks: ["/_next/static/chunks/bbb.js"] },
            },
            entryJSFiles: {
              "[project]/src/app/layout": ["static/chunks/ccc.js", "static/chunks/aaa.js"],
            },
          }) +
          ";",
      ].join("\n"),
    );
    expect(
      initialChunksOf(file)
        .map((chunk) => path.relative(NEXT_DIR, chunk))
        .sort(),
    ).toEqual(["static/chunks/aaa.js", "static/chunks/bbb.js", "static/chunks/ccc.js"]);
  });
});
