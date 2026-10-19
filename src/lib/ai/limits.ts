// The AI allowance per group and what the admin's AI page compares the
// provider counts with — shared by the server (lib/ai/usage.ts) and the
// pages that show it, so both say the same numbers.

/** Prompts a group may send per calendar month (UTC) unless the admin set its own. */
export const DEFAULT_GROUP_AI_LIMIT = 50;

/** The highest limit the admin can set — a typo of 50000 is not a plan. */
export const MAX_GROUP_AI_LIMIT = 10_000;

/** The month an AI usage counter belongs to: "2026-10", UTC like the daily quotas. */
export function aiUsageMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** The day a provider counter belongs to: "2026-10-19", UTC. */
export function aiUsageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A group's monthly allowance: its own limit if the admin set one (0 = blocked), else the default. */
export function effectiveAiLimit(group: { aiRequestLimit?: number | null }): number {
  const limit = group.aiRequestLimit;
  return typeof limit === "number" && Number.isInteger(limit) && limit >= 0
    ? limit
    : DEFAULT_GROUP_AI_LIMIT;
}

/** A limit the admin may set: null (back to the default) or a whole number 0…MAX_GROUP_AI_LIMIT. */
export function isValidAiLimit(limit: unknown): limit is number | null {
  return (
    limit === null ||
    (typeof limit === "number" &&
      Number.isInteger(limit) &&
      limit >= 0 &&
      limit <= MAX_GROUP_AI_LIMIT)
  );
}

/**
 * Requests per day each provider's free tier allows, as measured in 2026-09
 * (brain: Receipt Scan, "How far the free tier goes") — Google publishes no
 * numbers and no API for what is left, so the admin page compares the app's
 * own count with these. Matched on the provider name's model part.
 */
const DAILY_REQUEST_BUDGETS: { match: (provider: string) => boolean; budget: number }[] = [
  { match: (provider) => provider.startsWith("gemini:") && provider.includes("lite"), budget: 500 },
  { match: (provider) => provider.startsWith("gemini:") && provider.includes("flash"), budget: 20 },
  { match: (provider) => provider.startsWith("openrouter:"), budget: 50 },
];

/** The free-tier budget per day for a provider name ("gemini:gemini-flash-latest"), if known. */
export function dailyRequestBudget(provider: string): number | null {
  return DAILY_REQUEST_BUDGETS.find((entry) => entry.match(provider))?.budget ?? null;
}
