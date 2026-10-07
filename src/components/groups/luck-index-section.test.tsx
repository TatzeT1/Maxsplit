import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import type { Expense, Group, GroupMember, SplitGameId } from "@/lib/types";
import { LuckIndexSection } from "./luck-index-section";

// The numbers themselves are covered by game-stats.test.ts; this pins what
// the Spiele tab shows of them.

function member(displayName: string): GroupMember {
  return {
    displayName,
    photoURL: "",
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: "member",
    isPlaceholder: false,
  };
}

const group = {
  id: "g1",
  name: "WG",
  currency: "EUR",
  createdBy: "lea",
  createdAt: "2026-01-01T00:00:00.000Z",
  archived: false,
  memberUids: ["lea", "max", "ben"],
  members: { lea: member("Lea"), max: member("Max"), ben: member("Ben") },
  inviteCode: "ABC123",
} satisfies Group;

function round(id: string, gameId: SplitGameId, playerUids: string[], payer: string): Expense {
  return {
    id,
    description: "Pizza",
    amountMinor: 3000,
    currency: "EUR",
    date: "2026-10-02",
    category: null,
    paidBy: { lea: 3000 },
    splitMode: "exact",
    splits: { [payer]: { rawValue: 3000, amountMinor: 3000 } },
    createdBy: "lea",
    createdAt: "2026-10-02T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
    deletedAt: null,
    viaLottery: true,
    game: { gameId, playerUids, attempt: 1 },
  };
}

/** What a screen reader hears of a row: without the aria-hidden avatar and bar, spaces normalized. */
function spokenText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ");
}

function renderSection(expenses: Expense[]) {
  return render(
    <LocaleProvider initialLocale="de">
      <LuckIndexSection expenses={expenses} start={null} group={group} currentUid="max" />
    </LocaleProvider>,
  );
}

describe("LuckIndexSection", () => {
  it("lists the most bad luck first, in euros against the fair share", () => {
    // "tom" has left the group: his rounds still count for the others, he isn't listed.
    const players = ["lea", "max", "ben", "tom"];
    renderSection([
      round("r1", "wheel", players, "lea"),
      round("r2", "dicecup", players, "lea"),
      round("r3", "balloon", players, "ben"),
    ]);

    const list = screen.getByRole("list", { name: "Glücks-Index" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map(spokenText)).toEqual([
      "Lea+37,50 €mehr gezahlt als erwartet · 3 Runden",
      "Ben+7,50 €mehr gezahlt als erwartet · 3 Runden",
      "Max (du)−22,50 €weniger gezahlt als erwartet · 3 Runden",
    ]);
    expect(screen.getByText(/ab 3 Runden pro Person/)).toBeInTheDocument();
  });

  it("says so while nobody has three rounds yet", () => {
    renderSection([round("r1", "wheel", ["lea", "max"], "lea")]);
    expect(screen.getByText("Noch zu wenige Glücksspiel-Runden in diesem Zeitraum.")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("stays out of the way in a group that has only played duels", () => {
    const duels = [1, 2, 3].map((n) => round(`d${n}`, "memory", ["lea", "max"], "lea"));
    const { container } = renderSection(duels);
    expect(container).toBeEmptyDOMElement();
  });
});
