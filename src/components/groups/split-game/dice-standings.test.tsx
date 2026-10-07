import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import {
  diceStanding,
  recordDiceRoll,
  startDiceGame,
  type DiceGame,
  type DicePair,
} from "@/lib/games/dice-cup";
import type { Locale } from "@/lib/i18n/translate";
import type { GroupMember } from "@/lib/types";
import { DiceStandings, DiceTurnBanner } from "./dice-standings";

const member = (displayName: string): GroupMember => ({
  displayName,
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "member",
  isPlaceholder: false,
});
const members = {
  lea: member("Lea"),
  max: member("Max"),
  ben: member("Ben"),
  ana: member("Ana"),
};

function play(pool: string[], payers: number, rolls: [string, DicePair][]): DiceGame {
  let game = startDiceGame(pool, payers);
  for (const [uid, pair] of rolls) game = recordDiceRoll(game, uid, pair);
  return game;
}

function renderIn(locale: Locale, ui: React.ReactNode) {
  return render(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);
}

function hintFor(game: DiceGame, locale: Locale = "de"): string {
  const { container } = renderIn(
    locale,
    <DiceTurnBanner
      uid={game.contenders.find((uid) => !(uid in game.rolls))!}
      game={game}
      standing={diceStanding(game)}
      members={members}
    />,
  );
  return container.textContent ?? "";
}

describe("DiceStandings", () => {
  it("lists the zone on top, then the line, then who is still to roll, then the safe", () => {
    // One pays. Lea's 31 is the lowest so far; Max's 65 is already out of reach.
    const game = play(["lea", "max", "ben", "ana"], 1, [
      ["lea", [6, 5]],
      ["max", [3, 1]],
    ]);
    renderIn(
      "de",
      <DiceStandings
        game={game}
        standing={diceStanding(game)}
        members={members}
        activeUid="ben"
        saved={{ id: 1, uids: ["lea"] }}
      />,
    );
    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("Max");
    expect(rows[1]).toContain("Zahlzone");
    expect(rows[2]).toContain("Ben");
    expect(rows[2]).toContain("wartet");
    expect(rows[3]).toContain("Ana");
    expect(rows[4]).toContain("Lea");
    expect(rows[4]).toContain("sicher");
    expect(rows[4]).toContain("Gerettet!");
  });

  it("says the zone is still empty before anyone has rolled", () => {
    const game = startDiceGame(["lea", "max"], 1);
    renderIn(
      "de",
      <DiceStandings
        game={game}
        standing={diceStanding(game)}
        members={members}
        activeUid="lea"
        saved={null}
      />,
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Zahlzone — noch leer");
  });

  it("marks a tie on the line, and a roll-off once it has to be rolled", () => {
    const tied = play(["lea", "max", "ben"], 1, [
      ["lea", [4, 2]],
      ["max", [2, 4]],
    ]);
    const { unmount } = renderIn(
      "de",
      <DiceStandings
        game={tied}
        standing={diceStanding(tied)}
        members={members}
        activeUid="ben"
        saved={null}
      />,
    );
    const lines = screen.getAllByRole("listitem");
    expect(within(lines[0]).getByText("gleichauf")).toBeInTheDocument();
    expect(within(lines[1]).getByText("gleichauf")).toBeInTheDocument();
    unmount();

    const rollOff = recordDiceRoll(tied, "ben", [6, 6]);
    renderIn(
      "de",
      <DiceStandings
        game={rollOff}
        standing={diceStanding(rollOff)}
        members={members}
        activeUid="lea"
        saved={null}
      />,
    );
    expect(screen.getAllByText("Stechen")).toHaveLength(2);
  });
});

describe("DiceTurnBanner", () => {
  it("starts with the plain rule", () => {
    expect(hintFor(startDiceGame(["lea", "max"], 1))).toContain(
      "Becher schütteln — der kleinste Wurf zahlt.",
    );
  });

  it("names the roll to beat and whose it is", () => {
    const game = play(["lea", "max", "ben"], 1, [["lea", [2, 4]]]);
    expect(hintFor(game)).toContain("Schlag die 42 von Lea!");
    expect(hintFor(game, "en")).toContain("Beat Lea's 42!");
  });

  it("names everyone level on the line", () => {
    const game = play(["lea", "max", "ben"], 1, [
      ["lea", [5, 3]],
      ["max", [3, 5]],
    ]);
    expect(hintFor(game)).toContain("Schlag die 53 von Lea und Max!");
  });

  it("reads a Pasch as a Pasch, not as a small number", () => {
    const game = play(["lea", "max", "ben"], 1, [["lea", [3, 3]]]);
    expect(hintFor(game)).toContain("Schlag den 3er-Pasch von Lea!");
    expect(hintFor(game, "en")).toContain("Beat Lea's double 3s!");
  });

  it("never asks anyone to beat a Mäxchen", () => {
    const text = hintFor(play(["lea", "max"], 1, [["lea", [1, 2]]]));
    expect(text).toContain("Ein Mäxchen ist nicht zu schlagen");
    expect(text).not.toContain("Schlag die 21");
    // The chip beside it says "Mäxchen!", not "zu schlagen": once, in the line above, is all.
    expect(text).toContain("Mäxchen!");
    expect(text.split("zu schlagen")).toHaveLength(2);
  });

  it("says the zone is still open while fewer have rolled than will pay", () => {
    const game = play(["lea", "max", "ben"], 2, [["lea", [6, 5]]]);
    expect(hintFor(game)).toContain("Die Zahlzone ist noch offen");
  });
});
