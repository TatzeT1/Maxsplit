import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { formatMoney } from "@/lib/format/money";
import { splitEqual } from "@/lib/money/split";
import type { GroupMember } from "@/lib/types";
import { CatchCaption } from "./catch-caption";
import { GameResultBanner } from "./game-result-banner";

const member = (displayName: string): GroupMember => ({
  displayName,
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "member",
  isPlaceholder: false,
});
const members = { lea: member("Lea"), max: member("Max"), ben: member("Ben") };
const pizza = { description: "Pizza", amountMinor: 4781, currency: "EUR" };
// Intl puts a no-break space before "€"; Testing Library's matcher normalizes it to a space.
const euros = (minor: number) => formatMoney(minor, "EUR").replace(/\s/g, " ");

function renderDe(ui: React.ReactNode) {
  return render(<LocaleProvider initialLocale="de">{ui}</LocaleProvider>);
}

describe("GameResultBanner", () => {
  it("prints each payer's share exactly as the form books it", () => {
    const losers = ["max", "lea", "ben"];
    renderDe(
      <GameResultBanner loserUids={losers} members={members} stake={pizza} inDialog={false} />,
    );
    const booked = splitEqual(pizza.amountMinor, losers);
    // 47,81 € over three: the two rounding cents go to the first two in the list.
    expect(booked).toEqual({ max: 1594, lea: 1594, ben: 1593 });
    for (const uid of losers) {
      const name = members[uid as keyof typeof members].displayName;
      expect(
        screen.getByText(`${name}: ${euros(booked[uid])}`, { exact: false }),
      ).toBeInTheDocument();
    }
  });

  it("shows no amounts before one is typed", () => {
    renderDe(
      <GameResultBanner
        loserUids={["lea"]}
        members={members}
        stake={{ ...pizza, amountMinor: 0 }}
        inDialog={false}
      />,
    );
    expect(screen.queryByText(/€/)).toBeNull();
    expect(screen.getAllByText("Lea zahlt.").length).toBeGreaterThan(0);
  });
});

describe("CatchCaption", () => {
  it("says what this payer pays and for what, over the game's own line", () => {
    renderDe(<CatchCaption share={2390} stake={pizza} detail="Platz 4 von 5" />);
    expect(screen.getByText(`zahlt ${euros(2390)} · Pizza`)).toBeInTheDocument();
    expect(screen.getByText("Platz 4 von 5")).toBeInTheDocument();
  });

  it("drops the description when there is none, and the amount when there's no share", () => {
    const { rerender } = renderDe(
      <CatchCaption share={2390} stake={{ ...pizza, description: "  " }} />,
    );
    expect(screen.getByText(`zahlt ${euros(2390)}`)).toBeInTheDocument();
    rerender(
      <LocaleProvider initialLocale="de">
        <CatchCaption share={null} stake={pizza} detail="1 von 3 gefunden" />
      </LocaleProvider>,
    );
    expect(screen.queryByText(/zahlt/)).toBeNull();
    expect(screen.getByText("1 von 3 gefunden")).toBeInTheDocument();
  });
});
