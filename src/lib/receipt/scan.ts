import "server-only";

// Reads a receipt photo with whichever free vision model is configured:
// Google's Gemini API first (GEMINI_API_KEY), then OpenRouter's free models
// (OPENROUTER_API_KEY). Free tiers are rate limited and their models come
// and go, so a failure of one provider — an HTTP error, a timeout, an answer
// that isn't a receipt — falls through to the next instead of failing the
// scan. Keys are read at runtime: no NEXT_PUBLIC_, never in the bundle.

import { parseScannedReceipt, RECEIPT_PROMPT, type ScannedReceipt } from "./parse";

/**
 * The Gemini models when GEMINI_MODEL is unset, tried in order — the aliases
 * Google moves to each new Flash and Flash-Lite. The newest Flash is often
 * "experiencing high demand" (HTTP 503) on the free tier while Flash-Lite,
 * on its own capacity, still answers; it reads a receipt nearly as well.
 */
export const DEFAULT_GEMINI_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

/** OpenRouter's router across its free models, limited to ones that can see the image. */
export const DEFAULT_OPENROUTER_MODELS = ["openrouter/free"];

/** Per request. A receipt takes a vision model a few seconds; a stuck free endpoint takes forever. */
const PROVIDER_TIMEOUT_MS = 30_000;

/**
 * Overload and rate-limit answers: "try again later" usually means a second
 * later. One retry per provider, then the next one — production saw a scan
 * fail on two 503s from gemini-flash-latest in a row with no fallback set.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAY_MS = 1_500;

interface Http {
  fetchImpl: typeof fetch;
  retryDelayMs: number;
}

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
  read(image: ReceiptImage, http: Http): Promise<string>;
}

class ProviderError extends Error {}

async function postJson(
  http: Http,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const response = await http.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (response.ok) return response.json();
    // The body names the reason (quota, unknown model, bad key) — log it, it
    // never reaches the client. Capped: an HTML error page is long.
    const answer = await response.text().catch(() => "");
    const detail = answer.slice(0, 300);
    // A spent daily quota (Gemini's quotaId "…PerDay…") won't come back in a
    // second: straight on to the next model, which has its own quota.
    const dailyQuotaSpent = response.status === 429 && /PerDay/i.test(answer);
    if (attempt >= 2 || !RETRYABLE_STATUSES.has(response.status) || dailyQuotaSpent) {
      throw new ProviderError(`HTTP ${response.status}: ${detail}`);
    }
    await new Promise((resolve) => setTimeout(resolve, http.retryDelayMs));
  }
}

function geminiProvider(apiKey: string, model: string): Provider {
  return {
    name: `gemini:${model}`,
    async read(image, http) {
      const data = (await postJson(
        http,
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
    async read(image, http) {
      const data = (await postJson(
        http,
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
    // One provider per model: Gemini has no server-side fallback list like OpenRouter's.
    const models = listEnv(env.GEMINI_MODEL);
    for (const model of models.length > 0 ? models : DEFAULT_GEMINI_MODELS) {
      providers.push(geminiProvider(geminiKey, model));
    }
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
  options: { env?: ScanEnv; fetchImpl?: typeof fetch; retryDelayMs?: number } = {},
): Promise<ScanOutcome> {
  const providers = configuredProviders(options.env);
  if (providers.length === 0) return { ok: false, error: "scan-unavailable" };
  const http: Http = {
    fetchImpl: options.fetchImpl ?? fetch,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  };

  let empty: { receipt: ScannedReceipt; provider: string } | null = null;
  for (const provider of providers) {
    try {
      const receipt = parseScannedReceipt(await provider.read(image, http));
      if (!receipt) throw new ProviderError("answer was not JSON");
      if (receipt.items.length > 0) return { ok: true, receipt, provider: provider.name };
      empty ??= { receipt, provider: provider.name };
    } catch (error) {
      console.warn(`[receipt-scan] ${provider.name} failed:`, (error as Error).message);
    }
  }
  return empty ? { ok: true, ...empty } : { ok: false, error: "scan-failed" };
}
