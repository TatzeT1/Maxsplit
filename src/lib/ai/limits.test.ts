import { describe, expect, it } from "vitest";
import {
  aiUsageMonth,
  dailyRequestBudget,
  DEFAULT_GROUP_AI_LIMIT,
  effectiveAiLimit,
  isValidAiLimit,
  MAX_GROUP_AI_LIMIT,
} from "./limits";

describe("effectiveAiLimit", () => {
  it("is the default unless the admin set a whole number, 0 meaning blocked", () => {
    expect(effectiveAiLimit({})).toBe(DEFAULT_GROUP_AI_LIMIT);
    expect(effectiveAiLimit({ aiRequestLimit: null })).toBe(DEFAULT_GROUP_AI_LIMIT);
    expect(effectiveAiLimit({ aiRequestLimit: 0 })).toBe(0);
    expect(effectiveAiLimit({ aiRequestLimit: 200 })).toBe(200);
    expect(effectiveAiLimit({ aiRequestLimit: -1 })).toBe(DEFAULT_GROUP_AI_LIMIT);
    expect(effectiveAiLimit({ aiRequestLimit: 2.5 })).toBe(DEFAULT_GROUP_AI_LIMIT);
  });
});

describe("isValidAiLimit", () => {
  it("takes null and whole numbers in range only", () => {
    expect(isValidAiLimit(null)).toBe(true);
    expect(isValidAiLimit(0)).toBe(true);
    expect(isValidAiLimit(MAX_GROUP_AI_LIMIT)).toBe(true);
    expect(isValidAiLimit(MAX_GROUP_AI_LIMIT + 1)).toBe(false);
    expect(isValidAiLimit(-1)).toBe(false);
    expect(isValidAiLimit(1.5)).toBe(false);
    expect(isValidAiLimit("50")).toBe(false);
    expect(isValidAiLimit(undefined)).toBe(false);
  });
});

describe("aiUsageMonth", () => {
  it("is the UTC month", () => {
    expect(aiUsageMonth(new Date("2026-10-31T23:30:00-02:00"))).toBe("2026-11");
  });
});

describe("dailyRequestBudget", () => {
  it("knows Flash, Flash-Lite and OpenRouter, nothing else", () => {
    expect(dailyRequestBudget("gemini:gemini-flash-latest")).toBe(20);
    expect(dailyRequestBudget("gemini:gemini-flash-lite-latest")).toBe(500);
    expect(dailyRequestBudget("openrouter:openrouter/free")).toBe(50);
    expect(dailyRequestBudget("gemini:gemini-pro")).toBeNull();
  });
});
