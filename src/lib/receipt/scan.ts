import "server-only";

// Reads a receipt photo with whichever free vision model is configured:
// Google's Gemini API first (GEMINI_API_KEY), then OpenRouter's free models
// (OPENROUTER_API_KEY). Free tiers are rate limited and their models come
// and go, so a failure of one provider — an HTTP error, a timeout, an answer
// that isn't a receipt — falls through to the next instead of failing the
// scan. Keys are read at runtime: no NEXT_PUBLIC_, never in the bundle.

import { parseScannedReceipt, RECEIPT_PROMPT, type ScannedReceipt } from "./parse";

/** The Gemini model when GEMINI_MODEL is unset — the alias Google moves to each new Flash. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

/** OpenRouter's router across its free models, limited to ones that can see the image. */
export const DEFAULT_OPENROUTER_MODELS = ["openrouter/free"];

/** Per provider. A receipt takes a vision model a few seconds; a stuck free endpoint takes forever. */
const PROVIDER_TIMEOUT_MS = 30_000;

/** The environment variables read here — `process.env` by default, a plain object in tests. */
type ScanEnv = Record<string, string | undefined>;

export interface ReceiptImage {
  mimeType: string;
  /** The image bytes, base64 — no `data:` prefix. */
  base64: string;
}

export type ScanOutcome =
  | { ok: true; receipt: ScannedReceipt; provider: string }
  | { ok: false; error: "scan-unavailable" | "scan-failed" };

interface Provider {
  name: string;
  read(image: ReceiptImage, fetchImpl: typeof fetch): Promise<string>;
}

class ProviderError extends Error {}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    // The body names the reason (quota, unknown model, bad key) — log it, it
    // never reaches the client. Capped: an HTML error page is long.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new ProviderError(`HTTP ${response.status}: ${detail}`);
  }
  return response.json();
}

function geminiProvider(apiKey: string, model: string): Provider {
  return {
    name: `gemini:${model}`,
    async read(image, fetchImpl) {
      const data = (await postJson(
        fetchImpl,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": apiKey },
        {
          contents: [
            {
              parts: [
                { inline_data: { mime_type: image.mimeType, data: image.base64 } },
                { text: RECEIPT_PROMPT },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        },
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!text) throw new ProviderError("empty answer");
      return text;
    },
  };
}

function openRouterProvider(apiKey: string, models: string[]): Provider {
  return {
    name: `openrouter:${models.join(",")}`,
    async read(image, fetchImpl) {
      const data = (await postJson(
        fetchImpl,
        "https://openrouter.ai/api/v1/chat/completions",
        {
          Authorization: `Bearer ${apiKey}`,
          // Optional attribution headers OpenRouter shows in its dashboard.
          "X-Title": "Split",
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? { "HTTP-Referer": `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` }
            : {}),
        },
        {
          // More than one: OpenRouter tries them in order (its own fallback).
          ...(models.length > 1 ? { models } : { model: models[0] }),
          temperature: 0,
          // Ignored by models without JSON mode; the prompt asks for JSON anyway.
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: RECEIPT_PROMPT },
                {
                  type: "image_url",
                  image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
                },
              ],
            },
          ],
        },
      )) as { choices?: { message?: { content?: string | null } }[] };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new ProviderError("empty answer");
      return text;
    },
  };
}

function listEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** The configured providers, in the order they are tried. Empty: scanning is off. */
export function configuredProviders(env: ScanEnv = process.env): Provider[] {
  const providers: Provider[] = [];
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    providers.push(geminiProvider(geminiKey, env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL));
  }
  const openRouterKey = env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    const models = listEnv(env.OPENROUTER_MODELS);
    providers.push(
      openRouterProvider(openRouterKey, models.length > 0 ? models : DEFAULT_OPENROUTER_MODELS),
    );
  }
  return providers;
}

/** Whether any provider is configured — the UI hides the scan button otherwise. */
export function isReceiptScanConfigured(env: ScanEnv = process.env): boolean {
  return configuredProviders(env).length > 0;
}

/**
 * Reads the receipt with the first provider that gives a usable answer: JSON
 * with at least one line item. An answer without items (a blurry photo, not
 * a receipt) is tried on the next provider too — a different model may read
 * it — and is returned as is if nobody does better, so the client can say
 * "nothing found" rather than "failed".
 */
export async function scanReceiptImage(
  image: ReceiptImage,
  options: { env?: ScanEnv; fetchImpl?: typeof fetch } = {},
): Promise<ScanOutcome> {
  const providers = configuredProviders(options.env);
  if (providers.length === 0) return { ok: false, error: "scan-unavailable" };
  const fetchImpl = options.fetchImpl ?? fetch;

  let empty: { receipt: ScannedReceipt; provider: string } | null = null;
  for (const provider of providers) {
    try {
      const receipt = parseScannedReceipt(await provider.read(image, fetchImpl));
      if (!receipt) throw new ProviderError("answer was not JSON");
      if (receipt.items.length > 0) return { ok: true, receipt, provider: provider.name };
      empty ??= { receipt, provider: provider.name };
    } catch (error) {
      console.warn(`[receipt-scan] ${provider.name} failed:`, (error as Error).message);
    }
  }
  return empty ? { ok: true, ...empty } : { ok: false, error: "scan-failed" };
}
