import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { ESTIMATE_INPUT_MAX_CHARS } from "@/lib/games/estimate-input";
import { EstimateGuessPanel, ESTIMATE_ERROR_DELAY_MS } from "./estimate-guess-input";
import { RATIO_QUESTION, YEAR_QUESTION } from "./estimate-test-data";
import type { EstimatePublicQuestion } from "@/lib/types";

function renderPanel(
  props: Partial<React.ComponentProps<typeof EstimateGuessPanel>> = {},
  question: EstimatePublicQuestion = RATIO_QUESTION,
  locale: "de" | "en" = "de",
) {
  const onLock = vi.fn();
  const view = render(
    <LocaleProvider initialLocale={locale}>
      <EstimateGuessPanel
        question={question}
        stageIndex={0}
        stageKind="main"
        heading="Lea tippt"
        onLock={onLock}
        {...props}
      />
    </LocaleProvider>,
  );
  return { onLock, ...view };
}

function field(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("EstimateGuessPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, "visualViewport");
  });

  describe("the field (iOS rules)", () => {
    it("is a 16 px text field on phones, a text input with a keypad hint, and never autofocused", () => {
      renderPanel();
      expect(field().className).toContain("text-base");
      expect(field().className).toContain("md:text-sm");
      expect(field()).toHaveAttribute("type", "text");
      expect(field()).toHaveAttribute("inputmode", "decimal");
      expect(field()).toHaveAttribute("enterkeyhint", "done");
      expect(field()).toHaveAttribute("autocomplete", "off");
      expect(field()).toHaveAttribute("maxlength", String(ESTIMATE_INPUT_MAX_CHARS));
      expect(field()).not.toHaveFocus();
    });

    it("asks for the digit pad on a year", () => {
      renderPanel({}, YEAR_QUESTION);
      expect(field()).toHaveAttribute("inputmode", "numeric");
    });

    it("names the unit for assistive technology while the adornment stays decorative", () => {
      const { container } = renderPanel();
      expect(field()).toHaveAccessibleName("Lea tippt — in Meter");
      expect(container.querySelector("span[aria-hidden='true']")).toHaveTextContent("m");
    });

    it("names a year field by its kind, not a unit", () => {
      renderPanel({}, YEAR_QUESTION);
      expect(field()).toHaveAccessibleName("Lea tippt — als Jahreszahl");
    });
  });

  describe("the frame", () => {
    it("is one wrapper holding the compact question and the form, with no cap before a measurement", () => {
      const { container } = renderPanel();
      const frame = container.querySelector<HTMLElement>("[data-slot='estimate-guess-frame']");
      expect(frame).not.toBeNull();
      expect(frame?.style.maxHeight).toBe("");
      expect(frame?.querySelector("[data-slot='estimate-question-card']")).not.toBeNull();
      expect(frame?.querySelector("form")).not.toBeNull();
    });

    it("caps the frame with maxHeight (never height) at the visible band", () => {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: {
          height: 320,
          offsetTop: 0,
          scale: 1,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
      const { container } = renderPanel();
      const frame = container.querySelector<HTMLElement>("[data-slot='estimate-guess-frame']");
      expect(frame?.style.maxHeight).toBe("320px");
      expect(frame?.style.height).toBe("");
      vi.unstubAllGlobals();
    });

    it("lets the question scroll while the form never shrinks", () => {
      const { container } = renderPanel();
      expect(container.querySelector("[data-slot='estimate-question-card']")?.className).toContain(
        "overflow-y-auto",
      );
      expect(container.querySelector("form")?.className).toContain("shrink-0");
    });
  });

  describe("echo and ambiguity", () => {
    it("echoes what was read, grouped the way the language groups it", () => {
      renderPanel();
      type("2962");
      expect(screen.getByText("= 2.962 m")).toBeInTheDocument();
    });

    it("reads a German decimal comma", () => {
      renderPanel();
      type("1,5");
      expect(screen.getByText("= 1,5 m")).toBeInTheDocument();
    });

    it("warns when '2.962' could be 2,962 or 2 962", () => {
      renderPanel();
      type("2.962");
      expect(screen.getByText("= 2.962 m")).toBeInTheDocument();
      expect(
        screen.getByText("Gelesen als 2.962 m. Meinst du 2,962 m? Dann schreib 2,962."),
      ).toBeInTheDocument();
    });

    it("has no ambiguity line for an unambiguous number", () => {
      renderPanel();
      type("2500");
      expect(screen.queryByText(/Meinst du/)).toBeNull();
    });

    it("states the allowed range under the field", () => {
      renderPanel();
      expect(screen.getByText(/Erlaubt: 1\sm bis 10\.000\.000\sm/)).toBeInTheDocument();
    });

    it("echoes with the English marks in English", () => {
      renderPanel({}, RATIO_QUESTION, "en");
      type("1,234.5");
      expect(screen.getByText("= 1,234.5 m")).toBeInTheDocument();
    });
  });

  describe("errors", () => {
    it("shows no error on an untouched or emptied field", () => {
      renderPanel();
      expect(screen.queryByText("Gib eine Zahl ein.")).toBeNull();
      type("5");
      type("");
      expect(screen.queryByText("Gib eine Zahl ein.")).toBeNull();
      expect(field()).not.toHaveAttribute("aria-invalid", "true");
    });

    it("rejects stray characters at once", () => {
      renderPanel();
      type("12a");
      expect(screen.getAllByText("Nur Ziffern, Punkt und Komma, bitte.").length).toBeGreaterThan(0);
      expect(field()).toHaveAttribute("aria-invalid", "true");
    });

    it("rejects a minus sign at once", () => {
      renderPanel();
      type("-5");
      expect(screen.getAllByText("Die Antwort ist nie negativ.").length).toBeGreaterThan(0);
    });

    it("waits 600 ms before calling '1,2,3' a malformed number (typing '1,2' must not flash red at '1,')", () => {
      renderPanel();
      type("1,2,3");
      expect(screen.queryByText(/Das ist keine gültige Zahl/)).toBeNull();
      wait(ESTIMATE_ERROR_DELAY_MS - 1);
      expect(screen.queryByText(/Das ist keine gültige Zahl/)).toBeNull();
      wait(1);
      expect(
        screen.getAllByText("Das ist keine gültige Zahl. Beispiel: 1.234,5").length,
      ).toBeGreaterThan(0);
    });

    it("restarts the wait with every keystroke", () => {
      renderPanel();
      type("1,2,");
      wait(500);
      type("1,2,3");
      wait(500);
      expect(screen.queryByText(/Das ist keine gültige Zahl/)).toBeNull();
      wait(100);
      expect(screen.getAllByText(/Das ist keine gültige Zahl/).length).toBeGreaterThan(0);
    });

    it("shows a delayed error at once on blur", () => {
      renderPanel();
      type("1,2,3");
      fireEvent.blur(field());
      expect(screen.getAllByText(/Das ist keine gültige Zahl/).length).toBeGreaterThan(0);
    });

    it("gives the English example in English", () => {
      renderPanel({}, RATIO_QUESTION, "en");
      type("1.2.3");
      fireEvent.blur(field());
      expect(
        screen.getAllByText("That isn't a valid number. Example: 1,234.5").length,
      ).toBeGreaterThan(0);
    });

    it("says too many decimals only after the wait", () => {
      renderPanel();
      type("1,2345");
      expect(screen.queryByText("Höchstens 3 Nachkommastellen.")).toBeNull();
      wait(ESTIMATE_ERROR_DELAY_MS);
      expect(screen.getAllByText("Höchstens 3 Nachkommastellen.").length).toBeGreaterThan(0);
    });

    it("says why a number outside the class range is no guess, and keeps the lock disabled", () => {
      renderPanel({}, YEAR_QUESTION);
      type("2500");
      fireEvent.blur(field());
      expect(screen.getAllByText(/Höchstens 2100/).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Tipp sperren" })).toBeDisabled();
    });

    it("refuses a decimal for a year", () => {
      renderPanel({}, YEAR_QUESTION);
      type("1969,5");
      fireEvent.blur(field());
      expect(screen.getAllByText("Bitte eine ganze Zahl.").length).toBeGreaterThan(0);
    });

    it("refuses zero for a ratio question", () => {
      renderPanel();
      type("0");
      fireEvent.blur(field());
      expect(screen.getAllByText("Null gibt es bei dieser Frage nicht.").length).toBeGreaterThan(0);
    });

    it("announces a new error once, in an alert region, after the debounce", () => {
      renderPanel();
      type("1,2,3");
      const regions = screen.getAllByRole("alert");
      expect(regions.every((region) => region.textContent === "")).toBe(true);
      wait(ESTIMATE_ERROR_DELAY_MS);
      expect(
        screen
          .getAllByRole("alert")
          .some((region) => /keine gültige Zahl/.test(region.textContent ?? "")),
      ).toBe(true);
    });

    it("keeps the echo out of live announcements while typing and says it once on blur", () => {
      renderPanel();
      type("2962");
      expect(screen.getByText("= 2.962 m")).toHaveAttribute("aria-live", "off");
      const status = screen
        .getAllByRole("status")
        .find((region) => region.classList.contains("sr-only"));
      expect(status).toHaveTextContent("");
      fireEvent.blur(field());
      expect(status).toHaveTextContent("= 2.962 m");
    });
  });

  describe("locking", () => {
    it("disables the lock until there is a valid guess", () => {
      renderPanel();
      const lock = screen.getByRole("button", { name: "Tipp sperren" });
      expect(lock).toBeDisabled();
      type("12a");
      expect(lock).toBeDisabled();
      type("2962");
      expect(lock).toBeEnabled();
    });

    it("locks the parsed value in milli-units, then clears and blurs the field", () => {
      const { onLock } = renderPanel();
      field().focus();
      type("2.962,5");
      fireEvent.click(screen.getByRole("button", { name: "Tipp sperren" }));
      expect(onLock).toHaveBeenCalledTimes(1);
      expect(onLock).toHaveBeenCalledWith(2_962_500);
      expect(field().value).toBe("");
      expect(field()).not.toHaveFocus();
      expect(screen.queryByText(/= /)).toBeNull();
    });

    it("locks on the keyboard's Enter too", () => {
      const { onLock } = renderPanel();
      type("1969");
      fireEvent.submit(field().closest("form") as HTMLFormElement);
      expect(onLock).toHaveBeenCalledWith(1_969_000);
    });

    it("does not lock an invalid value even if the form is submitted", () => {
      const { onLock } = renderPanel();
      type("1,2,3");
      fireEvent.submit(field().closest("form") as HTMLFormElement);
      expect(onLock).not.toHaveBeenCalled();
      expect(screen.getAllByText(/keine gültige Zahl/).length).toBeGreaterThan(0);
    });

    it("cannot lock twice while busy, nor while the parent says why not", () => {
      const first = renderPanel({ busy: true });
      type("100");
      expect(screen.getByRole("button", { name: "Tipp sperren" })).toBeDisabled();
      fireEvent.submit(field().closest("form") as HTMLFormElement);
      expect(first.onLock).not.toHaveBeenCalled();
      first.unmount();

      const second = renderPanel({ disabledReason: "Keine Verbindung" });
      type("100");
      expect(screen.getByRole("button", { name: "Tipp sperren" })).toBeDisabled();
      expect(screen.getByText("Keine Verbindung")).toBeInTheDocument();
      fireEvent.submit(field().closest("form") as HTMLFormElement);
      expect(second.onLock).not.toHaveBeenCalled();
    });

    it("shows the parent's own error under the button", () => {
      renderPanel({ error: "Der Tipp konnte nicht gespeichert werden." });
      expect(screen.getByText("Der Tipp konnte nicht gespeichert werden.")).toBeInTheDocument();
    });

    it("says the lock is final", () => {
      renderPanel();
      expect(screen.getByText("Danach kannst du ihn nicht mehr ändern.")).toBeInTheDocument();
    });
  });
});
