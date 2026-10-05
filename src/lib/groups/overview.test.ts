import { describe, expect, it } from "vitest";
import { ownBalance, partitionArchived, sortGroupsForList, summarizeBalances } from "./overview";

type TestGroup = {
  id: string;
  currency: string;
  createdAt: string;
  archived?: boolean;
  balancesMinor?: Record<string, number>;
};

const group = (id: string, extra: Partial<TestGroup> = {}): TestGroup => ({
  id,
  currency: "EUR",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

describe("ownBalance", () => {
  it("is null while a group has no cached balances — unknown, not zero", () => {
    expect(ownBalance(group("a"), "me")).toBeNull();
  });

  it("reads zero for someone the ledger doesn't mention", () => {
    expect(ownBalance(group("a", { balancesMinor: { other: 500 } }), "me")).toBe(0);
  });

  it("reads the member's own figure, positive or negative", () => {
    const g = group("a", { balancesMinor: { me: -1250, other: 1250 } });
    expect(ownBalance(g, "me")).toBe(-1250);
    expect(ownBalance(g, "other")).toBe(1250);
  });
});

describe("summarizeBalances", () => {
  it("keeps credits and debts apart instead of netting them", () => {
    const summary = summarizeBalances(
      [
        group("a", { balancesMinor: { me: 4000 } }),
        group("b", { balancesMinor: { me: -2500 } }),
        group("c", { balancesMinor: { me: 1000 } }),
      ],
      "me",
    );

    expect(summary.byCurrency).toEqual([
      { currency: "EUR", owedToYouMinor: 5000, youOweMinor: 2500 },
    ]);
  });

  it("never adds different currencies together", () => {
    const summary = summarizeBalances(
      [
        group("a", { currency: "EUR", balancesMinor: { me: 1000 } }),
        group("b", { currency: "CHF", balancesMinor: { me: -300 } }),
        group("c", { currency: "CHF", balancesMinor: { me: 200 } }),
      ],
      "me",
    );

    expect(summary.byCurrency).toEqual([
      { currency: "CHF", owedToYouMinor: 200, youOweMinor: 300 },
      { currency: "EUR", owedToYouMinor: 1000, youOweMinor: 0 },
    ]);
  });

  it("counts archived groups — hiding one doesn't settle it", () => {
    const summary = summarizeBalances(
      [group("a", { archived: true, balancesMinor: { me: -700 } })],
      "me",
    );

    expect(summary.byCurrency).toEqual([{ currency: "EUR", owedToYouMinor: 0, youOweMinor: 700 }]);
  });

  it("leaves out currencies where everything is square", () => {
    const summary = summarizeBalances(
      [group("a", { balancesMinor: { me: 0 } }), group("b", { balancesMinor: {} })],
      "me",
    );

    expect(summary).toEqual({ byCurrency: [], unknownCount: 0 });
  });

  it("counts groups without balances as unknown rather than as zero", () => {
    const summary = summarizeBalances(
      [group("a"), group("b", { balancesMinor: { me: 100 } }), group("c")],
      "me",
    );

    expect(summary.unknownCount).toBe(2);
    expect(summary.byCurrency).toEqual([{ currency: "EUR", owedToYouMinor: 100, youOweMinor: 0 }]);
  });
});

describe("sortGroupsForList", () => {
  it("puts groups with something open first, newest first within each half", () => {
    const sorted = sortGroupsForList(
      [
        group("old-square", { createdAt: "2026-01-01", balancesMinor: { me: 0 } }),
        group("new-square", { createdAt: "2026-03-01", balancesMinor: {} }),
        group("old-owing", { createdAt: "2026-01-02", balancesMinor: { me: -500 } }),
        group("new-owed", { createdAt: "2026-02-01", balancesMinor: { me: 500 } }),
      ],
      "me",
    );

    expect(sorted.map((g) => g.id)).toEqual(["new-owed", "old-owing", "new-square", "old-square"]);
  });

  it("treats a group without balances like a square one", () => {
    const sorted = sortGroupsForList(
      [
        group("unknown", { createdAt: "2026-05-01" }),
        group("open", { createdAt: "2026-01-01", balancesMinor: { me: 100 } }),
      ],
      "me",
    );

    expect(sorted.map((g) => g.id)).toEqual(["open", "unknown"]);
  });

  it("doesn't reorder the list it was given", () => {
    const input = [
      group("a", { createdAt: "2026-01-01" }),
      group("b", { createdAt: "2026-02-01" }),
    ];
    sortGroupsForList(input, "me");

    expect(input.map((g) => g.id)).toEqual(["a", "b"]);
  });
});

describe("partitionArchived", () => {
  it("files only groups flagged archived under Archiviert — older ones without the flag stay", () => {
    const { active, archived } = partitionArchived([
      group("a", { archived: false }),
      group("b", { archived: true }),
      group("c"),
    ]);

    expect(active.map((g) => g.id)).toEqual(["a", "c"]);
    expect(archived.map((g) => g.id)).toEqual(["b"]);
  });
});
