import { describe, expect, it } from "vitest";
import { latestActivity } from "./last-activity";

const expense = (over: Partial<Parameters<typeof latestActivity>[0][number]> = {}) => ({
  description: "Pizza",
  emoji: null,
  amountMinor: 3000,
  createdAt: "2026-11-01T10:00:00.000Z",
  paidBy: { a: 3000 },
  createdBy: "a",
  deletedAt: null,
  ...over,
});

describe("latestActivity", () => {
  it("is null for an empty ledger", () => {
    expect(latestActivity([], [])).toBeNull();
  });

  it("picks the newest expense and its main payer", () => {
    const result = latestActivity(
      [
        expense(),
        expense({
          description: "Einkauf",
          createdAt: "2026-11-03T10:00:00.000Z",
          paidBy: { a: 1000, b: 4000 },
          amountMinor: 5000,
        }),
      ],
      [],
    );
    expect(result).toEqual({
      kind: "expense",
      description: "Einkauf",
      emoji: null,
      amountMinor: 5000,
      at: "2026-11-03T10:00:00.000Z",
      byUid: "b",
    });
  });

  it("skips deleted expenses", () => {
    const result = latestActivity(
      [
        expense(),
        expense({ description: "Weg", createdAt: "2026-11-04T00:00:00.000Z", deletedAt: "x" }),
      ],
      [],
    );
    expect(result?.description).toBe("Pizza");
  });

  it("lets a newer payment win", () => {
    const result = latestActivity(
      [expense()],
      [{ fromUid: "b", toUid: "a", amountMinor: 1500, createdAt: "2026-11-02T00:00:00.000Z" }],
    );
    expect(result).toMatchObject({ kind: "settlement", byUid: "b", toUid: "a", amountMinor: 1500 });
  });
});
