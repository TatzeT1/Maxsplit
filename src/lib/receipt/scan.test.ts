import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredProviders, scanReceiptImage } from "./scan";

const IMAGE = { mimeType: "image/jpeg", base64: "AAAA" };
const RECEIPT_JSON = JSON.stringify({
  merchant: "Krone",
  date: null,
  total: 10.5,
  items: [{ name: "Cola", quantity: 3, total: 10.5 }],
});

function geminiAnswer(text: string) {
  return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
}

function openRouterAnswer(text: string) {
  return Response.json({ choices: [{ message: { content: text } }] });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("configuredProviders", () => {
  it("is empty without keys, Gemini first when both are set", () => {
    expect(configuredProviders({})).toEqual([]);
    const names = configuredProviders({ GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o" }).map(
      (provider) => provider.name,
    );
    expect(names).toEqual(["gemini:gemini-flash-latest", "openrouter:openrouter/free"]);
  });

  it("takes the model names from the environment", () => {
    const names = configuredProviders({
      GEMINI_API_KEY: "g",
      GEMINI_MODEL: "gemini-3-flash",
      OPENROUTER_API_KEY: "o",
      OPENROUTER_MODELS: " a/b:free , c/d:free ,",
    }).map((provider) => provider.name);
    expect(names).toEqual(["gemini:gemini-3-flash", "openrouter:a/b:free,c/d:free"]);
  });
});

describe("scanReceiptImage", () => {
  it("is unavailable without any key, and never calls out", async () => {
    const fetchImpl = vi.fn();
    expect(await scanReceiptImage(IMAGE, { env: {}, fetchImpl })).toEqual({
      ok: false,
      error: "scan-unavailable",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the photo to Gemini with the key in a header, not the URL", async () => {
    const fetchImpl = vi.fn(async () => geminiAnswer(RECEIPT_JSON));
    const outcome = await scanReceiptImage(IMAGE, { env: { GEMINI_API_KEY: "secret" }, fetchImpl });

    expect(outcome).toEqual({
      ok: true,
      provider: "gemini:gemini-flash-latest",
      receipt: {
        merchant: "Krone",
        date: null,
        totalMinor: 1050,
        items: [{ name: "Cola", quantity: 3, totalMinor: 1050 }],
      },
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    );
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].inline_data).toEqual({
      mime_type: "image/jpeg",
      data: "AAAA",
    });
  });

  it("falls back to OpenRouter when Gemini fails, sending a data URL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("googleapis")
        ? new Response("quota exceeded", { status: 429 })
        : openRouterAnswer("```json\n" + RECEIPT_JSON + "\n```"),
    );
    const outcome = await scanReceiptImage(IMAGE, {
      env: { GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o", OPENROUTER_MODELS: "a:free,b:free" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(outcome.ok && outcome.provider).toBe("openrouter:a:free,b:free");
    const [, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer o");
    const body = JSON.parse(init.body as string);
    expect(body.models).toEqual(["a:free", "b:free"]);
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/jpeg;base64,AAAA");
    expect(console.warn).toHaveBeenCalledWith(
      "[receipt-scan] gemini:gemini-flash-latest failed:",
      expect.stringContaining("429"),
    );
  });

  it("tries the next provider when one answers with no items, keeping the empty read last", async () => {
    const empty = JSON.stringify({ merchant: null, items: [] });
    const both = vi.fn(async (url: string) =>
      url.includes("googleapis") ? geminiAnswer(empty) : openRouterAnswer(RECEIPT_JSON),
    );
    const env = { GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o" };
    const outcome = await scanReceiptImage(IMAGE, {
      env,
      fetchImpl: both as unknown as typeof fetch,
    });
    expect(outcome.ok && outcome.receipt.items).toHaveLength(1);

    const neither = vi.fn(async (url: string) =>
      url.includes("googleapis") ? geminiAnswer(empty) : openRouterAnswer(empty),
    );
    const none = await scanReceiptImage(IMAGE, {
      env,
      fetchImpl: neither as unknown as typeof fetch,
    });
    expect(none).toEqual({
      ok: true,
      provider: "gemini:gemini-flash-latest",
      receipt: { merchant: null, date: null, totalMinor: null, items: [] },
    });
  });

  it("fails when every provider errors or talks prose", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("googleapis")
        ? Promise.reject(new TypeError("fetch failed"))
        : openRouterAnswer("I cannot help with that."),
    );
    expect(
      await scanReceiptImage(IMAGE, {
        env: { GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o" },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toEqual({ ok: false, error: "scan-failed" });
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});
