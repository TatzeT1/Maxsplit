import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { estimateDistance } from "@/lib/games/estimate-input";
import type { EstimateChatSummary } from "@/lib/types";
import { EstimateChatLines } from "./estimate-chat-lines";
import { RATIO_QUESTION } from "./estimate-test-data";

const TRUTH = 2_962_000;

function payer(uid: string, name: string, guess: number | null, byLot = false) {
  return {
    uid,
    name,
    guessMilli: guess,
    distance: guess === null ? null : estimateDistance("ratio", guess, TRUTH),
    byLot,
  };
}

const summary: EstimateChatSummary = {
  resolvedBy: "distance",
  lines: [
    {
      text: RATIO_QUESTION.text,
      unit: RATIO_QUESTION.unit,
      scale: "ratio",
      format: "quantity",
      truthMilli: TRUTH,
      payers: [
        payer("lea", "Lea", 1_200_000),
        payer("ben", "Ben", null),
        payer("tom", "Tom", 1_000_000, true),
      ],
    },
  ],
};

function renderLines(value: EstimateChatSummary, locale: "de" | "en" = "de") {
  return render(
    <LocaleProvider initialLocale={locale}>
      <EstimateChatLines summary={value} />
    </LocaleProvider>,
  );
}

describe("EstimateChatLines", () => {
  it("prints the question with the truth", () => {
    renderLines(summary);
    expect(
      screen.getByText(/„Wie hoch ist der Testberg\?“ — richtig: 2\.962\sm/),
    ).toBeInTheDocument();
  });

  it("prints each payer: guess with the error, 'kein Tipp', 'per Los bestimmt'", () => {
    renderLines(summary);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/Lea: 1\.200\sm \(Faktor 2,47 zu niedrig\)/);
    expect(items[1]).toHaveTextContent("Ben: kein Tipp");
    expect(items[2]).toHaveTextContent("Tom: per Los bestimmt");
  });

  it("uses the summary's name snapshots, so a departed member is not a question mark", () => {
    renderLines(summary);
    expect(screen.queryByText(/\?\s*:/)).toBeNull();
    expect(screen.getByText(/^Lea:/)).toBeInTheDocument();
  });

  it("prints one block per question that produced a payer", () => {
    renderLines({ ...summary, lines: [summary.lines[0], summary.lines[0]] });
    expect(screen.getAllByText(/richtig:/).length).toBe(2);
  });

  it("speaks English", () => {
    renderLines(summary, "en");
    expect(screen.getByText(/“How high is Mount Test\?” — answer: 2,962\sm/)).toBeInTheDocument();
    expect(screen.getByText(/Lea: 1,200\sm \(Factor 2\.47 too low\)/)).toBeInTheDocument();
    expect(screen.getByText("Ben: no guess")).toBeInTheDocument();
    expect(screen.getByText("Tom: picked by draw")).toBeInTheDocument();
  });

  it("renders nothing for a summary without lines", () => {
    const { container } = renderLines({ resolvedBy: "distance", lines: [] });
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });
});
