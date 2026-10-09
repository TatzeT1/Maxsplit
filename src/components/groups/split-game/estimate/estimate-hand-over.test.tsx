import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { EstimateHandOver } from "./estimate-hand-over";

function renderHandOver(onReady = vi.fn(), position = 2) {
  const view = render(
    <LocaleProvider initialLocale="de">
      <EstimateHandOver name="Lea" position={position} total={3} onReady={onReady} />
    </LocaleProvider>,
  );
  return { onReady, ...view };
}

describe("EstimateHandOver", () => {
  it("says who gets the phone and how far the round is", () => {
    renderHandOver();
    expect(screen.getByRole("heading", { name: "Handy an Lea" })).toBeInTheDocument();
    expect(screen.getByText(/Lea tippt jetzt geheim/)).toBeInTheDocument();
    expect(screen.getAllByText("Tipp 2 von 3").length).toBeGreaterThan(0);
  });

  it("hands over only when the player taps 'Ich bin Lea'", () => {
    const { onReady } = renderHandOver();
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ich bin Lea" }));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("holds no input and no question: nothing for a glance between seats to read", () => {
    const { container } = renderHandOver();
    expect(container.querySelector("input, textarea")).toBeNull();
    // The only digits on the screen are the seat counter.
    const digits = (container.textContent ?? "").replace(/Tipp \d+ von \d+/g, "").match(/\d/g);
    expect(digits).toBeNull();
  });
});
