import { afterEach, describe, expect, it, vi } from "vitest";
import { CLASSIFY_BATCH_SIZE, classifyEntries, parseClassification } from "./classify";

function geminiAnswer(text: string) {
  return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseClassification", () => {
  it("puts each answer at its number, whatever order it came in", () => {
    const text = JSON.stringify({
      items: [
        { i: 1, family: "housing", kind: "miete" },
        { i: "0", family: "meat", kind: "Mett" },
      ],
    });
    expect(parseClassification(text, 3)).toEqual([
      { family: "meat", kind: "Mett" },
      { family: "housing", kind: "Miete" },
      null,
    ]);
  });

  it("ignores numbers out of range, unknown families and duplicates", () => {
    const text = `\`\`\`json
{"items": [{"i": 5, "family": "meat", "kind": "Mett"}, {"i": 0, "family": "nope", "kind": "X"},
 {"i": 1, "family": "meat", "kind": "Mett"}, {"i": 1, "family": "fish", "kind": "Lachs"}]}
\`\`\``;
    expect(parseClassification(text, 2)).toEqual([null, { family: "meat", kind: "Mett" }]);
  });

  it("is null when nothing in it is usable, so the next provider is asked", () => {
    expect(parseClassification("no idea", 1)).toBeNull();
    expect(parseClassification('{"items": []}', 1)).toBeNull();
    expect(parseClassification('{"items": [{"i": 0, "family": "x", "kind": "y"}]}', 1)).toBeNull();
  });
});

describe("classifyEntries", () => {
  it("asks in batches, text only, with the category as a hint", async () => {
    const bodies: { contents: { parts: { text?: string; inline_data?: unknown }[] }[] }[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      const prompt: string = body.contents[0].parts[0].text;
      const count = (prompt.match(/^\d+: /gm) ?? []).length;
      return geminiAnswer(
        JSON.stringify({
          items: Array.from({ length: count }, (_, i) => ({ i, family: "other", kind: "Ding" })),
        }),
      );
    });
    const entries = Array.from({ length: CLASSIFY_BATCH_SIZE + 1 }, (_, i) => ({
      text: `Posten ${i}`,
      hint: i === 0 ? "restaurant" : null,
    }));
    const result = await classifyEntries(entries, {
      env: { GEMINI_API_KEY: "g", GEMINI_MODEL: "m" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    });

    expect(result).toHaveLength(CLASSIFY_BATCH_SIZE + 1);
    expect(result.every((product) => product?.kind === "Ding")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies[0].contents[0].parts).toHaveLength(1);
    expect(bodies[0].contents[0].parts[0].inline_data).toBeUndefined();
    expect(bodies[0].contents[0].parts[0].text).toContain('0: "Posten 0" (category: restaurant)');
    expect(bodies[1].contents[0].parts[0].text).toContain(`0: "Posten ${CLASSIFY_BATCH_SIZE}"`);
  });

  it("leaves a batch unclassified when no provider answers usefully", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => geminiAnswer("Sorry."));
    const result = await classifyEntries([{ text: "Edeka" }], {
      env: { GEMINI_API_KEY: "g" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(result).toEqual([null]);
    // Both default Gemini models were asked.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
