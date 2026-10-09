import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/firebase/client", () => ({ db: {}, auth: {} }));

import { LocaleProvider } from "@/components/locale-provider";
import { EstimateCountdown, formatCountdown } from "./estimate-countdown";

const START = new Date("2026-05-01T10:00:00.000Z");
const GRACE = 5000;

function renderCountdown(closesInMs: number, lastCall = false, locale: "de" | "en" = "de") {
  const closesAt = new Date(START.getTime() + closesInMs).toISOString();
  return render(
    <LocaleProvider initialLocale={locale}>
      <EstimateCountdown closesAt={closesAt} graceMs={GRACE} lastCall={lastCall} />
    </LocaleProvider>,
  );
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** The polite announcement region (the `role="timer"` element is not live). */
const announcement = () => screen.getAllByRole("status")[0];

describe("formatCountdown", () => {
  it("prints m:ss below an hour and h:mm:ss from an hour on, rounding up", () => {
    expect(formatCountdown(161_000)).toBe("2:41");
    expect(formatCountdown(160_100)).toBe("2:41");
    expect(formatCountdown(5_000)).toBe("0:05");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-3000)).toBe("0:00");
    expect(formatCountdown(3_600_000)).toBe("1:00:00");
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
  });
});

describe("EstimateCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("is a timer that counts down and is not itself a live region", () => {
    renderCountdown(161_000);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("Noch 2:41");
    expect(timer).toHaveAttribute("aria-live", "off");
    tick(3000);
    expect(timer).toHaveTextContent("Noch 2:38");
  });

  it("labels a running last call", () => {
    renderCountdown(118_000, true);
    expect(screen.getByRole("timer")).toHaveTextContent("Letzte Chance läuft — noch 1:58.");
  });

  it("speaks English", () => {
    renderCountdown(65_000, false, "en");
    expect(screen.getByRole("timer")).toHaveTextContent("1:05 left");
  });

  it("announces politely at one minute, ten seconds and zero, and nowhere else", () => {
    renderCountdown(75_000);
    const seen: string[] = [];
    const record = () => {
      const text = announcement().textContent ?? "";
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    };
    record();
    expect(seen).toEqual([]);
    for (let second = 0; second < 80; second += 1) {
      tick(1000);
      record();
    }
    expect(seen).toEqual(["Noch eine Minute.", "Noch zehn Sekunden.", "Zeit abgelaufen."]);
  });

  it("says the time is up from closesAt on, while the clock runs through the grace", () => {
    renderCountdown(2000);
    tick(2000);
    expect(screen.getByRole("timer")).toHaveTextContent("Die Zeit ist um.");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    tick(GRACE);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not pulse under reduced motion (the pulse is a motion-safe class only)", () => {
    renderCountdown(5000);
    expect(screen.getByRole("timer").className).toContain("motion-safe:animate-pulse");
    expect(screen.getByRole("timer").className).not.toMatch(/(^|\s)animate-pulse/);
  });

  it("renders nothing for a deadline it cannot read", () => {
    const { container } = render(
      <LocaleProvider initialLocale="de">
        <EstimateCountdown closesAt="not a date" graceMs={GRACE} lastCall={false} />
      </LocaleProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
