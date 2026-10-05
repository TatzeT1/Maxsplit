import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import type { Group, GroupMember } from "@/lib/types";
import { GroupsOverview } from "./groups-overview";

// The groups list: totals over every group, groups with something open first,
// archived ones folded away below.

const member: GroupMember = {
  displayName: "Max",
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "owner",
  isPlaceholder: false,
};

function group(name: string, extra: Partial<Group> = {}): Group {
  return {
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    currency: "EUR",
    createdBy: "me",
    createdAt: "2026-01-01T00:00:00.000Z",
    archived: false,
    memberUids: ["me"],
    members: { me: member },
    inviteCode: "CODE",
    ...extra,
  };
}

function renderOverview(groups: Group[]) {
  render(
    <LocaleProvider initialLocale="de">
      <GroupsOverview groups={groups} uid="me" />
    </LocaleProvider>,
  );
}

/** Which of `names` each listed group card is, top to bottom. */
function listedNames(names: string[]): (string | undefined)[] {
  return screen
    .getAllByRole("link")
    .map((link) => names.find((name) => within(link).queryByText(name)));
}

describe("GroupsOverview — totals", () => {
  it("adds up what you're owed and what you owe, per currency and over every group", () => {
    renderOverview([
      group("WG", { balancesMinor: { me: 4000 } }),
      group("Urlaub", { balancesMinor: { me: -2500 } }),
      group("Skitrip", { currency: "CHF", balancesMinor: { me: -1000 } }),
    ]);

    const totals = screen.getByRole("region", { name: "Insgesamt" });
    expect(within(totals).getAllByText(/40,00\s€/)).toHaveLength(1);
    expect(within(totals).getAllByText(/25,00\s€/)).toHaveLength(1);
    expect(within(totals).getByText(/10,00\sCHF/)).toBeInTheDocument();
  });

  it("is absent when everything is square", () => {
    renderOverview([group("WG", { balancesMinor: { me: 0 } })]);

    expect(screen.queryByRole("region", { name: "Insgesamt" })).not.toBeInTheDocument();
  });

  it("says when a group's balance isn't known yet, instead of counting it as square", () => {
    renderOverview([group("WG", { balancesMinor: { me: 100 } }), group("Alt")]);

    expect(screen.getByText(/ohne Saldo-Stand zählen noch nicht mit/)).toBeInTheDocument();
  });

  it("still counts an archived group's debt, so hiding it doesn't hide what you owe", () => {
    renderOverview([group("Urlaub", { archived: true, balancesMinor: { me: -700 } })]);

    const totals = screen.getByRole("region", { name: "Insgesamt" });
    expect(within(totals).getByText(/7,00\s€/)).toBeInTheDocument();
  });
});

describe("GroupsOverview — order", () => {
  it("lists groups with something open first, newest first within each half", () => {
    renderOverview([
      group("Quitt neu", { createdAt: "2026-03-01T00:00:00.000Z", balancesMinor: { me: 0 } }),
      group("Schuldet alt", { createdAt: "2026-01-02T00:00:00.000Z", balancesMinor: { me: -500 } }),
      group("Quitt alt", { createdAt: "2026-01-01T00:00:00.000Z", balancesMinor: {} }),
    ]);

    expect(listedNames(["Quitt neu", "Schuldet alt", "Quitt alt"])).toEqual([
      "Schuldet alt",
      "Quitt neu",
      "Quitt alt",
    ]);
  });
});

describe("GroupsOverview — archived groups", () => {
  it("folds them away under a count, out of the main list", () => {
    renderOverview([group("WG"), group("Urlaub 2024", { archived: true })]);

    expect(listedNames(["WG", "Urlaub 2024"])).toEqual(["WG"]);
    const toggle = screen.getByRole("button", { name: "Archiviert (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Urlaub 2024")).not.toBeInTheDocument();
  });

  it("unfolds them on tap, still showing what you owe in each", () => {
    renderOverview([
      group("WG"),
      group("Urlaub 2024", { archived: true, balancesMinor: { me: -700 } }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Archiviert (1)" }));

    expect(screen.getByRole("button", { name: "Archiviert (1)" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const link = screen.getByText("Urlaub 2024").closest("a") as HTMLElement;
    expect(link).toHaveAttribute("href", "/groups/urlaub-2024");
    expect(within(link).getByText(/7,00\s€/)).toBeInTheDocument();
  });

  it("opens the fold by itself when nothing else is left, and says so", () => {
    renderOverview([group("Urlaub 2024", { archived: true })]);

    expect(screen.getByText("Alle deine Gruppen sind archiviert.")).toBeInTheDocument();
    expect(screen.getByText("Urlaub 2024")).toBeInTheDocument();
  });

  it("shows no fold at all without archived groups", () => {
    renderOverview([group("WG")]);

    expect(screen.queryByRole("button", { name: /Archiviert/ })).not.toBeInTheDocument();
  });
});
