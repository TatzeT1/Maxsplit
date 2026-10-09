import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import type { Expense, ExpenseGame } from "@/lib/types";
import { decidedAudit, makeSplits } from "./estimate/estimate-test-data";
import { GameRecordSummary } from "./game-record";

type ExpenseCheck = Pick<Expense, "amountMinor" | "currency" | "splits">;

const expense: ExpenseCheck = {
  amountMinor: 3000,
  currency: "EUR",
  splits: makeSplits({ lea: 0, max: 0, ben: 3000 }),
};

function renderRecord(
  game: ExpenseGame | null | undefined,
  props: { expense?: ExpenseCheck } = {},
) {
  return render(
    <LocaleProvider initialLocale="de">
      <GameRecordSummary game={game} showPlayers {...props} />
    </LocaleProvider>,
  );
}

describe("GameRecordSummary", () => {
  it("says which game decided and in which attempt", () => {
    renderRecord({ gameId: "wheel", playerUids: ["a", "b"], attempt: 2 });
    expect(screen.getByText(/Per Spiel entschieden/)).toBeInTheDocument();
    expect(screen.getByText("im 2. Versuch")).toBeInTheDocument();
  });

  it("mounts no audit disclosure for a game without an estimate record — and never loads its chunk", () => {
    renderRecord({ gameId: "wheel", playerUids: ["a", "b"], attempt: 1 });
    expect(document.querySelector("details")).toBeNull();
    renderRecord(null);
    expect(document.querySelector("details")).toBeNull();
  });

  it("mounts the lazily loaded audit disclosure for an estimate game", async () => {
    renderRecord(
      {
        gameId: "estimate",
        playerUids: ["lea", "max", "ben"],
        attempt: 1,
        estimate: decidedAudit(),
      },
      { expense },
    );
    // The summary is there at once; the table arrives with its chunk.
    expect(screen.getByText(/Schätzfragen/)).toBeInTheDocument();
    expect(await screen.findByText("Protokoll anzeigen")).toBeInTheDocument();
    expect(await screen.findByText("Rechnung nachgeprüft — stimmt.")).toBeInTheDocument();
  });

  it("checks the audit against the expense it is given", async () => {
    renderRecord(
      {
        gameId: "estimate",
        playerUids: ["lea", "max", "ben"],
        attempt: 1,
        estimate: decidedAudit(),
      },
      {
        expense: {
          ...expense,
          splits: makeSplits({ lea: 3000, max: 0, ben: 0 }),
        },
      },
    );
    expect(
      await screen.findByText("Das Protokoll passt nicht zur Aufteilung.", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("still renders the audit (replay only) when the form passes no expense", async () => {
    renderRecord({
      gameId: "estimate",
      playerUids: ["lea", "max", "ben"],
      attempt: 1,
      estimate: decidedAudit(),
    });
    expect(await screen.findByText("Rechnung nachgeprüft — stimmt.")).toBeInTheDocument();
  });
});
