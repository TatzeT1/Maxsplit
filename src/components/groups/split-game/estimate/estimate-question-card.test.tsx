import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { EstimateQuestionCard } from "./estimate-question-card";
import { RATIO_QUESTION, YEAR_QUESTION } from "./estimate-test-data";

function renderCard(ui: React.ReactNode, locale: "de" | "en" = "de") {
  return render(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);
}

describe("EstimateQuestionCard", () => {
  it("prints the question in the viewer's language with the unit and the allowed range", () => {
    renderCard(<EstimateQuestionCard question={RATIO_QUESTION} stageIndex={0} stageKind="main" />);
    expect(screen.getByText("Wie hoch ist der Testberg?")).toBeInTheDocument();
    expect(screen.getByText("Gesucht: Meter")).toBeInTheDocument();
    expect(screen.getByText("Die Frage")).toBeInTheDocument();
    // 1 m to 10 000 000 m, grouped the German way, with the unit.
    expect(screen.getByText(/Erlaubt: 1\sm bis 10\.000\.000\sm/)).toBeInTheDocument();
  });

  it("speaks English when asked to", () => {
    renderCard(
      <EstimateQuestionCard question={RATIO_QUESTION} stageIndex={0} stageKind="main" />,
      "en",
    );
    expect(screen.getByText("How high is Mount Test?")).toBeInTheDocument();
    expect(screen.getByText("Looking for: metres")).toBeInTheDocument();
  });

  it("asks for a year, not a unit, for a year question", () => {
    renderCard(<EstimateQuestionCard question={YEAR_QUESTION} stageIndex={0} stageKind="main" />);
    expect(screen.getByText("Gesucht: eine Jahreszahl")).toBeInTheDocument();
  });

  it("badges a Stechfrage with its number", () => {
    renderCard(
      <EstimateQuestionCard question={RATIO_QUESTION} stageIndex={2} stageKind="stechen" />,
    );
    expect(screen.getByText("Stechfrage 2")).toBeInTheDocument();
    expect(screen.queryByText("Die Frage")).toBeNull();
  });

  it("drops the chip and the range hint when compact (the form prints the range itself)", () => {
    const { container } = renderCard(
      <EstimateQuestionCard compact question={RATIO_QUESTION} stageIndex={0} stageKind="main" />,
    );
    expect(screen.queryByText(/Erlaubt:/)).toBeNull();
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
    expect(screen.getByText("Wie hoch ist der Testberg?")).toBeInTheDocument();
  });
});
