import "server-only";

// Asks whichever free model is configured — for a receipt photo (below) or a
// plain text question (askModels, used by lib/products to classify):
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
  /** HTTP requests sent so far — a retry is one more against the provider's quota. */
  requests: number;
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
  | { ok: false; error: "scan-unavailable" | "scan-failed" | "ai-limit" };

/** One question to a model: a prompt, and a photo for the vision ones. */
export interface ModelRequest {
  prompt: string;
  image?: ReceiptImage;
}

/** One provider tried for one prompt — what the AI log (lib/ai/usage.ts) shows. */
export interface ModelAttempt {
  provider: string;
  ok: boolean;
  ms: number;
  /** HTTP requests it took: 2 when an overload was retried. */
  requests: number;
  error?: string;
}

/**
 * Counts and logs prompts per group (lib/ai/usage.ts) — passed in, so this
 * file stays free of Firestore. Without one, nothing is counted (tests).
 */
export interface ModelMeter {
  /** Before each prompt: false when the allowance is spent, and nothing is sent. */
  take(): Promise<boolean>;
  /** After each prompt: every provider tried, and what was asked or read — never the photo. */
  record(call: {
    answeredBy: string | null;
    attempts: ModelAttempt[];
    summary: string[];
  }): Promise<void>;
}

/** The meter said no: the group's allowance of prompts is spent. */
export class ModelLimitError extends Error {}

interface Provider {
  name: string;
  ask(request: ModelRequest, http: Http): Promise<string>;
}

class ProviderError extends Error {}

async function postJson(
  http: Http,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    http.requests++;
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
    async ask({ prompt, image }, http) {
      const data = (await postJson(
        http,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": apiKey },
        {
          contents: [
            {
              parts: [
                ...(image
                  ? [{ inline_data: { mime_type: image.mimeType, data: image.base64 } }]
                  : []),
                { text: prompt },
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
    async ask({ prompt, image }, http) {
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
                { type: "text", text: prompt },
                ...(image
                  ? [
                      {
                        type: "image_url",
                        image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
                      },
                    ]
                  : []),
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

/** Options shared by every call into the chain; tests pass a fake `fetch` and env. */
export interface AskOptions {
  env?: ScanEnv;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
  meter?: ModelMeter;
}

function httpFrom(options: AskOptions): Http {
  return {
    fetchImpl: options.fetchImpl ?? fetch,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    requests: 0,
  };
}

/** Runs one provider's turn and notes it in `attempts`, failed or not. */
async function attempt<T>(
  provider: Provider,
  http: Http,
  attempts: ModelAttempt[],
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const requestsBefore = http.requests;
  const note = (ok: boolean, error?: string) =>
    attempts.push({
      provider: provider.name,
      ok,
      ms: Date.now() - started,
      requests: http.requests - requestsBefore,
      ...(error ? { error: error.slice(0, 200) } : {}),
    });
  try {
    const result = await run();
    note(true);
    return result;
  } catch (error) {
    note(false, (error as Error).message);
    throw error;
  }
}

/** A failed log write must never fail the scan or the classification it describes. */
async function record(
  meter: ModelMeter | undefined,
  call: Parameters<ModelMeter["record"]>[0],
): Promise<void> {
  if (!meter) return;
  try {
    await meter.record(call);
  } catch (error) {
    console.error("[ai-usage] record failed:", error);
  }
}

/**
 * Asks the providers in order and returns the first answer `accept` takes
 * (non-null), or `null` when none does or none is configured. A provider
 * that fails — HTTP error, timeout, an answer `accept` refuses — is logged
 * under `label` and the next one asked. Throws ModelLimitError, having sent
 * nothing, when the meter refuses the prompt; `summary` is what its log shows.
 */
export async function askModels<T>(
  request: ModelRequest,
  accept: (answer: string) => T | null,
  label: string,
  options: AskOptions = {},
  summary: string[] = [],
): Promise<T | null> {
  const providers = configuredProviders(options.env);
  if (providers.length === 0) return null;
  if (options.meter && !(await options.meter.take())) throw new ModelLimitError();
  const http = httpFrom(options);
  const attempts: ModelAttempt[] = [];
  let result: T | null = null;
  let answeredBy: string | null = null;
  for (const provider of providers) {
    try {
      result = await attempt(provider, http, attempts, async () => {
        const accepted = accept(await provider.ask(request, http));
        if (accepted === null) throw new ProviderError("unusable answer");
        return accepted;
      });
      answeredBy = provider.name;
      break;
    } catch (error) {
      console.warn(`[${label}] ${provider.name} failed:`, (error as Error).message);
    }
  }
  await record(options.meter, { answeredBy, attempts, summary });
  return result;
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
  options: AskOptions = {},
): Promise<ScanOutcome> {
  const providers = configuredProviders(options.env);
  if (providers.length === 0) return { ok: false, error: "scan-unavailable" };
  if (options.meter && !(await options.meter.take())) return { ok: false, error: "ai-limit" };
  const http = httpFrom(options);
  const attempts: ModelAttempt[] = [];

  let found: { receipt: ScannedReceipt; provider: string } | null = null;
  for (const provider of providers) {
    try {
      const receipt = await attempt(provider, http, attempts, async () => {
        const parsed = parseScannedReceipt(
          await provider.ask({ prompt: RECEIPT_PROMPT, image }, http),
        );
        if (!parsed) throw new ProviderError("answer was not JSON");
        return parsed;
      });
      if (receipt.items.length > 0) {
        found = { receipt, provider: provider.name };
        break;
      }
      found ??= { receipt, provider: provider.name };
    } catch (error) {
      console.warn(`[receipt-scan] ${provider.name} failed:`, (error as Error).message);
    }
  }
  // The log keeps what was read, not the photo: the merchant and the line names.
  const summary = found
    ? [
        ...(found.receipt.merchant ? [found.receipt.merchant] : []),
        ...found.receipt.items.map((item) => item.name),
      ]
    : [];
  await record(options.meter, { answeredBy: found?.provider ?? null, attempts, summary });
  return found ? { ok: true, ...found } : { ok: false, error: "scan-failed" };
}
