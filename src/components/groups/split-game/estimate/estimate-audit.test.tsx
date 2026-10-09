import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { formatMoney } from "@/lib/format/money";
import { verifyEstimateAudit } from "@/lib/games/estimate-audit";
import type { EstimateAudit, Expense } from "@/lib/types";
import { EstimateAuditTable } from "./estimate-audit";
import { decidedAudit, DEGREES_QUESTION, makeSplits } from "./estimate-test-data";

type ExpenseCheck = Pick<Expense, "amountMinor" | "currency" | "splits">;

function renderAudit(
  audit: EstimateAudit,
  expense?: ExpenseCheck,
  locale: "de" | "en" = "de",
  roundHref?: string,
) {
  return render(
    <LocaleProvider initialLocale={locale}>
      <EstimateAuditTable audit={audit} expense={expense} roundHref={roundHref} />
    </LocaleProvider>,
  );
}

/** The expense as an online round books it: 30,00 € on Ben alone. */
const bookedExpense: ExpenseCheck = {
  amountMinor: 3000,
  currency: "EUR",
  splits: makeSplits({ lea: 0, max: 0, ben: 3000 }),
};

const check = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-slot='estimate-audit-check']") as HTMLElement;

describe("EstimateAuditTable", () => {
  it("is a closed disclosure called 'Protokoll anzeigen'", () => {
    const { container } = renderAudit(decidedAudit(), bookedExpense);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Protokoll anzeigen")).toBeInTheDocument();
  });

  it("starts the self-consistent fixture on a verified replay", () => {
    expect(verifyEstimateAudit(decidedAudit())).toBe(true);
  });

  describe("content", () => {
    it("prints question, truth, source, year and the English definition per stage", () => {
      renderAudit(decidedAudit(), bookedExpense);
      expect(screen.getByText("Wie hoch ist der Testberg?")).toBeInTheDocument();
      expect(screen.getByText(/2\.962\sm/)).toBeInTheDocument();
      const source = screen.getByRole("link", { name: "Testamt (fiktiv)" });
      expect(source).toHaveAttribute("href", "https://example.org/testberg");
      expect(source).toHaveAttribute("rel", "noopener noreferrer");
      expect(screen.getByText(/Fixture data, not a fact/)).toHaveAttribute("lang", "en");
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it("never links a source url that is not http(s)", () => {
      const audit = decidedAudit();
      audit.stages[0].sourceUrl = "javascript:alert(1)";
      renderAudit(audit, bookedExpense);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText(/Testamt \(fiktiv\)/)).toBeInTheDocument();
    });

    it("lists every player ranked furthest first with guess, error and recomputed result", () => {
      renderAudit(decidedAudit(), bookedExpense);
      const table = screen.getByRole("table");
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(["Spieler", "Tipp", "Abweichung", "Ergebnis"]);
      const body = within(table).getAllByRole("row").slice(1);
      expect(body.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
        "Ben",
        "Max",
        "Lea",
      ]);
      expect(body[0]).toHaveTextContent("8.000 m");
      expect(body[0]).toHaveTextContent("Faktor 2,7 zu hoch");
      expect(body[0]).toHaveTextContent("zahlt");
      expect(body[1]).toHaveTextContent("sicher");
    });

    it("names who typed a seat on a one-phone round, and who held the phone", () => {
      const audit = decidedAudit({ mode: "local", createdBy: "lea" });
      audit.stages[0].enteredBy = { max: "lea", ben: "lea" };
      renderAudit(audit, bookedExpense);
      expect(screen.getByText("Tipps eingegeben am Handy von Lea")).toBeInTheDocument();
      expect(screen.getAllByText("eingetragen von Lea").length).toBe(2);
    });

    it("says nothing about a phone on an online round", () => {
      renderAudit(decidedAudit({ mode: "online" }), bookedExpense);
      expect(screen.queryByText(/Tipps eingegeben/)).toBeNull();
    });

    it("lists a player without a guess as 'kein Tipp'", () => {
      const audit = decidedAudit();
      audit.stages[0].guessesMilli = { lea: 2_900_000, max: 1_200_000, ben: null };
      audit.stages[0].reason = "time-up";
      renderAudit(audit, bookedExpense);
      const row = within(screen.getByRole("table")).getAllByRole("row")[1];
      expect(row).toHaveTextContent("Ben");
      expect(row).toHaveTextContent("kein Tipp");
      expect(row).toHaveTextContent("zahlt");
    });

    it("links back to the round when it is given", () => {
      renderAudit(decidedAudit(), bookedExpense, "de", "/groups/g/estimate/round1");
      expect(screen.getByRole("link", { name: "Zur Runde" })).toHaveAttribute(
        "href",
        "/groups/g/estimate/round1",
      );
    });

    it("speaks English", () => {
      renderAudit(decidedAudit(), bookedExpense, "en");
      expect(screen.getByText("Show the record")).toBeInTheDocument();
      expect(screen.getByText("How high is Mount Test?")).toBeInTheDocument();
      expect(screen.getByText("Calculation re-checked — it matches.")).toBeInTheDocument();
    });
  });

  describe("the check line", () => {
    it("confirms a replay that matches the live split — in words, never 'verified'", () => {
      const { container } = renderAudit(decidedAudit(), bookedExpense);
      expect(check(container)).toHaveAttribute("data-check", "ok");
      expect(check(container)).toHaveTextContent("Rechnung nachgeprüft — stimmt.");
      expect(container.textContent).not.toMatch(/verifiziert|verified/i);
    });

    it("also confirms without an expense (the replay alone)", () => {
      const { container } = renderAudit(decidedAudit());
      expect(check(container)).toHaveAttribute("data-check", "ok");
    });

    it("flags a booking that names someone the replay does not", () => {
      const audit = decidedAudit();
      audit.booked.loserUids = ["max"];
      const { container } = renderAudit(audit, {
        ...bookedExpense,
        splits: makeSplits({ lea: 0, max: 3000, ben: 0 }),
      });
      expect(check(container)).toHaveAttribute("data-check", "bad");
      expect(check(container)).toHaveTextContent("Das Protokoll passt nicht zur Aufteilung.");
      expect(check(container).className).toContain("text-destructive");
    });

    it("flags an expense whose payers changed after the game", () => {
      const { container } = renderAudit(decidedAudit(), {
        ...bookedExpense,
        splits: makeSplits({ lea: 3000, max: 0, ben: 0 }),
      });
      expect(check(container)).toHaveAttribute("data-check", "bad");
      expect(check(container)).toHaveTextContent("Das Protokoll passt nicht zur Aufteilung.");
    });

    it("flags amounts that are no longer an equal split between the payers", () => {
      const audit = decidedAudit({
        booked: { amountMinor: 3000, currency: "EUR", loserUids: ["ben", "max"] },
      });
      // A two-payer replay needs a two-slot stage.
      audit.stages[0].slots = 2;
      audit.stages[0].guessesMilli = { lea: 2_900_000, max: 1_200_000, ben: 8_000_000 };
      expect(verifyEstimateAudit(audit)).toBe(true);
      const { container } = renderAudit(audit, {
        amountMinor: 3000,
        currency: "EUR",
        splits: makeSplits({ lea: 0, max: 2000, ben: 1000 }),
      });
      expect(check(container)).toHaveAttribute("data-check", "bad");
      expect(check(container)).toHaveTextContent("Die Beträge wurden nach dem Spiel geändert.");
    });

    it("notes — neutrally — a changed total that is still an equal split", () => {
      const { container } = renderAudit(decidedAudit(), {
        ...bookedExpense,
        amountMinor: 3200,
        splits: makeSplits({ lea: 0, max: 0, ben: 3200 }),
      });
      expect(check(container)).toHaveAttribute("data-check", "note");
      expect(check(container)).toHaveTextContent(
        `Betrag nach dem Spiel von ${formatMoney(3000, "EUR")} auf ${formatMoney(3200, "EUR")} geändert`.replace(
          /\s/g,
          " ",
        ),
      );
      expect(check(container).className).not.toContain("text-destructive");
    });

    it("says 'mismatch' for an audit whose replay disagrees with itself, never silence", () => {
      const audit = decidedAudit();
      audit.booked.loserUids = ["lea"];
      const { container } = renderAudit(audit);
      expect(check(container)).toHaveAttribute("data-check", "bad");
    });

    it("says 'mismatch' for an unknown rules version", () => {
      const { container } = renderAudit(decidedAudit({ rulesVersion: 99 }), bookedExpense);
      expect(check(container)).toHaveAttribute("data-check", "bad");
    });

    it("does not crash on an impossible stage: that stage says it does not match", () => {
      const audit = decidedAudit();
      audit.stages[0].slots = 7;
      const { container } = renderAudit(audit, bookedExpense);
      expect(check(container)).toHaveAttribute("data-check", "bad");
      expect(screen.queryByRole("table")).toBeNull();
      expect(
        screen.getAllByText("Das Protokoll passt nicht zur Aufteilung.").length,
      ).toBeGreaterThan(0);
    });

    it("accepts a claimed placeholder: the audit keeps the old uid, the expense the new one", () => {
      const audit = decidedAudit();
      audit.names.ben.placeholder = true;
      const { container } = renderAudit(audit, {
        amountMinor: 3000,
        currency: "EUR",
        splits: makeSplits({ lea: 0, max: 0, realben: 3000 }),
      });
      expect(check(container)).toHaveAttribute("data-check", "ok");
    });
  });

  describe("Stechfrage and lot", () => {
    /** Stage 0: truth 100, guesses 90 / 111 contested with tolerance; stage 1: the Stechfrage. */
    function stechenAudit(): EstimateAudit {
      const base = decidedAudit();
      return {
        ...base,
        resolvedBy: "stechen",
        booked: { amountMinor: 3000, currency: "EUR", loserUids: ["max"] },
        stages: [
          {
            ...base.stages[0],
            text: DEGREES_QUESTION.text,
            unit: DEGREES_QUESTION.unit,
            scale: "interval",
            truthMilli: 100_000,
            tolerance: { kind: "interval", milli: 1000 },
            guessesMilli: { lea: 90_000, max: 111_000, ben: 100_000 },
            slots: 1,
          },
          {
            ...base.stages[0],
            kind: "stechen",
            text: DEGREES_QUESTION.text,
            unit: DEGREES_QUESTION.unit,
            scale: "interval",
            truthMilli: 500_000,
            tolerance: null,
            guessesMilli: { lea: 480_000, max: 650_000 },
            slots: 1,
          },
        ],
      };
    }

    it("replays both stages and carries the contest from one to the next", () => {
      const audit = stechenAudit();
      expect(verifyEstimateAudit(audit)).toBe(true);
      const { container } = renderAudit(audit, {
        ...bookedExpense,
        splits: makeSplits({ lea: 0, max: 3000, ben: 0 }),
      });
      expect(container.querySelectorAll("[data-slot='estimate-audit-stage']").length).toBe(2);
      const tables = screen.getAllByRole("table");
      expect(tables).toHaveLength(2);
      // Stage 0: both contested players are "Stechen"; stage 1 decides.
      expect(within(tables[0]).getAllByText("Stechen").length).toBe(2);
      expect(within(tables[1]).getByText("zahlt")).toBeInTheDocument();
      expect(check(container)).toHaveAttribute("data-check", "ok");
    });

    it("names the lot's picks when a draw decided", () => {
      const base = decidedAudit();
      const audit: EstimateAudit = {
        ...base,
        resolvedBy: "shuffle",
        shuffled: ["max", "lea"],
        booked: { amountMinor: 3000, currency: "EUR", loserUids: ["max"] },
        stages: [
          {
            ...base.stages[0],
            guessesMilli: { lea: 1_000_000, max: 1_000_000, ben: 2_962_000 },
            slots: 1,
          },
        ],
      };
      expect(verifyEstimateAudit(audit)).toBe(true);
      const { container } = renderAudit(audit, {
        ...bookedExpense,
        splits: makeSplits({ lea: 0, max: 3000, ben: 0 }),
      });
      expect(screen.getByText("Per Los: Max")).toBeInTheDocument();
      const maxRow = screen
        .getAllByRole("row")
        .find((row) => row.textContent?.startsWith("Max")) as HTMLElement;
      expect(maxRow).toHaveTextContent("zahlt");
      expect(check(container)).toHaveAttribute("data-check", "ok");
    });
  });
});
