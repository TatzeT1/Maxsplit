import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { EstimateSeats } from "./estimate-seats";
import { MEMBERS, RATIO_QUESTION, makeReveal, makeRound, makeStage } from "./estimate-test-data";

const ENTRANTS = {
  lea: { displayName: "Lea", isPlaceholder: false },
  max: { displayName: "Max", isPlaceholder: false },
  ben: { displayName: "Ben", isPlaceholder: false },
};

function seats(
  stage: ReturnType<typeof makeStage>,
  overrides: Parameters<typeof makeRound>[1] = {},
  currentUid = "lea",
) {
  const round = makeRound([stage], {
    mode: "online",
    entrants: ENTRANTS,
    order: ["ben", "lea", "max"],
    ...overrides,
  });
  return render(
    <LocaleProvider initialLocale="de">
      <EstimateSeats stage={stage} round={round} members={MEMBERS} currentUid={currentUid} />
    </LocaleProvider>,
  );
}

const rows = () => screen.getAllByRole("listitem");

describe("EstimateSeats", () => {
  it("lists the contenders in seat order with who has answered, in words", () => {
    seats(makeStage(RATIO_QUESTION, ["lea", "max", "ben"], null, { submitted: ["max"] }));
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Ben"),
      expect.stringContaining("Lea"),
      expect.stringContaining("Max"),
    ]);
    expect(within(rows()[0]).getByText("tippt noch")).toBeInTheDocument();
    expect(within(rows()[2]).getByText("getippt")).toBeInTheDocument();
    expect(screen.getByText("1 von 3 haben getippt")).toBeInTheDocument();
  });

  it("marks the current player", () => {
    seats(makeStage(RATIO_QUESTION, ["lea", "max", "ben"], null), {}, "max");
    expect(within(rows()[2]).getByText("du")).toBeInTheDocument();
    expect(within(rows()[0]).queryByText("du")).toBeNull();
  });

  it("shows entrants who are out of a Stechfrage as watching", () => {
    seats(makeStage(RATIO_QUESTION, ["lea", "max"], null, { index: 1, kind: "stechen" }));
    expect(rows()).toHaveLength(3);
    expect(within(rows()[2]).getByText("Ben")).toBeInTheDocument();
    expect(within(rows()[2]).getByText("schaut zu")).toBeInTheDocument();
    expect(screen.getByText("0 von 2 haben getippt")).toBeInTheDocument();
  });

  it("says 'kein Tipp' for a revealed stage somebody never answered", () => {
    const reveal = makeReveal(RATIO_QUESTION, 100_000, [
      { uid: "max", guess: null, fate: "pays" },
      { uid: "lea", guess: 90_000, fate: "safe" },
    ]);
    seats(makeStage(RATIO_QUESTION, ["lea", "max"], reveal, { submitted: ["lea"] }));
    expect(within(rows()[1]).getByText("kein Tipp")).toBeInTheDocument();
  });

  it("falls back to the round's name snapshot for somebody the group no longer has", () => {
    const stage = makeStage(RATIO_QUESTION, ["lea", "zoe"], null);
    const round = makeRound([stage], {
      entrants: { lea: ENTRANTS.lea, zoe: { displayName: "Zoe", isPlaceholder: false } },
      order: ["lea", "zoe"],
    });
    render(
      <LocaleProvider initialLocale="de">
        <EstimateSeats stage={stage} round={round} members={MEMBERS} currentUid="lea" />
      </LocaleProvider>,
    );
    expect(screen.getByText("Zoe")).toBeInTheDocument();
    expect(screen.queryByText("?")).toBeNull();
  });
});
