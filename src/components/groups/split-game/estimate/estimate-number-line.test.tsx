import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Mock the hook, not the media query: motion-dom reads the preference once per
// module instance and jsdom has no matchMedia, so a media-query mock would pass
// vacuously on the non-reduced path.
const motion = vi.hoisted(() => ({ reduced: true }));
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduced,
}));

import { LocaleProvider } from "@/components/locale-provider";
import { EstimateNumberLine, pinDropGapMs, type EstimateLineStep } from "./estimate-number-line";
import { DEGREES_QUESTION, RATIO_QUESTION, YEAR_QUESTION, makeReveal } from "./estimate-test-data";
import type { EstimatePublicQuestion, EstimateReveal } from "@/lib/types";

const NAMES = { lea: "Lea", max: "Max", ben: "Ben", tom: "Tom" };

function renderLine(
  options: {
    question?: EstimatePublicQuestion;
    reveal?: EstimateReveal;
    step?: EstimateLineStep;
    names?: Record<string, string>;
    currentUid?: string;
  } = {},
) {
  const question = options.question ?? RATIO_QUESTION;
  const reveal =
    options.reveal ??
    makeReveal(question, 2_962_000, [
      { uid: "ben", guess: 8_000_000, fate: "pays" },
      { uid: "max", guess: 1_200_000, fate: "safe" },
      { uid: "lea", guess: 2_900_000, fate: "safe" },
    ]);
  return render(
    <LocaleProvider initialLocale="de">
      <EstimateNumberLine
        question={question}
        reveal={reveal}
        names={options.names ?? NAMES}
        currentUid={options.currentUid}
        step={options.step ?? "all"}
      />
    </LocaleProvider>,
  );
}

const pins = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-slot='estimate-pin']"));

describe("EstimateNumberLine", () => {
  beforeEach(() => {
    motion.reduced = true;
  });

  it("is hidden from assistive technology: the ranking carries the same information", () => {
    const { container } = renderLine();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("pins every guess with initial and printed name — colour is never the only cue", () => {
    const { container } = renderLine();
    expect(pins(container).map((pin) => pin.dataset.uid)).toEqual(["lea", "max", "ben"]);
    const lea = pins(container).find((pin) => pin.dataset.uid === "lea");
    expect(lea).toHaveTextContent("Lea");
    expect(lea).toHaveTextContent("L");
  });

  it("drops the pins in the order of `names` (the seat order)", () => {
    const { container } = renderLine({ names: { ben: "Ben", lea: "Lea", max: "Max" } });
    expect(pins(container).map((pin) => pin.dataset.uid)).toEqual(["ben", "lea", "max"]);
  });

  it("does not pin a player without a guess", () => {
    const reveal = makeReveal(RATIO_QUESTION, 2_962_000, [
      { uid: "tom", guess: null, fate: "pays" },
      { uid: "lea", guess: 2_900_000, fate: "safe" },
    ]);
    const { container } = renderLine({ reveal });
    expect(pins(container).map((pin) => pin.dataset.uid)).toEqual(["lea"]);
  });

  it("stacks pins of equal guesses into different lanes instead of overlapping", () => {
    const reveal = makeReveal(RATIO_QUESTION, 2_962_000, [
      { uid: "ben", guess: 1_000_000, fate: "pays" },
      { uid: "max", guess: 1_000_000, fate: "safe" },
      { uid: "lea", guess: 1_000_000, fate: "safe" },
    ]);
    const { container } = renderLine({ reveal });
    const tops = pins(container).map((pin) => pin.style.top);
    expect(new Set(tops).size).toBe(3);
  });

  it("insets the track so a pin at either end stays inside the card", () => {
    const { container } = renderLine();
    const track = container.querySelector<HTMLElement>("[data-slot='estimate-number-line'] > div");
    expect(track?.style.marginInline).toBe("28px");
  });

  it("marks 'you' with a bold label and a heavier ring", () => {
    const { container } = renderLine({ currentUid: "max" });
    const max = pins(container).find((pin) => pin.dataset.uid === "max");
    const lea = pins(container).find((pin) => pin.dataset.uid === "lea");
    expect(max?.querySelector(".font-bold")).not.toBeNull();
    expect(lea?.querySelector(".font-bold")).toBeNull();
    expect(max?.querySelector(".ring-foreground")).not.toBeNull();
  });

  it("labels a log axis for a ratio question and a linear one not", () => {
    const ratio = renderLine();
    expect(ratio.container.textContent).toContain("logarithmisch");
    ratio.unmount();

    const reveal = makeReveal(DEGREES_QUESTION, 100_000, [
      { uid: "lea", guess: 90_000, fate: "safe" },
    ]);
    const linear = renderLine({ question: DEGREES_QUESTION, reveal });
    expect(linear.container.textContent).not.toContain("logarithmisch");
    expect(linear.container.firstElementChild).toHaveAttribute("data-scale", "interval");
  });

  it("prints year ticks without a thousands separator", () => {
    const reveal = makeReveal(YEAR_QUESTION, 1_969_000, [
      { uid: "lea", guess: 1_950_000, fate: "safe" },
      { uid: "max", guess: 1_990_000, fate: "safe" },
    ]);
    const { container } = renderLine({ question: YEAR_QUESTION, reveal });
    expect(container.textContent).toMatch(/19\d\d/);
    expect(container.textContent).not.toMatch(/1\.9\d\d/);
  });

  describe("truth", () => {
    it("is not rendered at step 'pins': no pin, no value, no attribute", () => {
      const { container } = renderLine({ step: "pins" });
      expect(container.querySelector("[data-slot='estimate-truth-pin']")).toBeNull();
      expect(container.innerHTML).not.toContain("2962");
      expect(container.innerHTML).not.toContain("2.962");
      expect(container.querySelector("[data-slot='estimate-tolerance-band']")).toBeNull();
    });

    it("appears with the flag at step 'truth' and 'all'", () => {
      for (const step of ["truth", "all"] as const) {
        const { container, unmount } = renderLine({ step });
        expect(container.querySelector("[data-slot='estimate-truth-pin']")).not.toBeNull();
        unmount();
      }
    });

    it("draws the tolerance band around it only once the truth is shown", () => {
      const reveal = makeReveal(
        DEGREES_QUESTION,
        100_000,
        [
          { uid: "lea", guess: 90_000, fate: "contested" },
          { uid: "max", guess: 111_000, fate: "contested" },
        ],
        { tolerance: { kind: "interval", milli: 1000 } },
      );
      const hidden = renderLine({ question: DEGREES_QUESTION, reveal, step: "pins" });
      expect(hidden.container.querySelector("[data-slot='estimate-tolerance-band']")).toBeNull();
      hidden.unmount();
      const shown = renderLine({ question: DEGREES_QUESTION, reveal, step: "truth" });
      expect(shown.container.querySelector("[data-slot='estimate-tolerance-band']")).not.toBeNull();
    });
  });

  describe("motion", () => {
    it("spaces pin drops by at most 350 ms and keeps a crowd within 3 s", () => {
      expect(pinDropGapMs(3)).toBe(350);
      expect(pinDropGapMs(32) * 32).toBeLessThanOrEqual(3000);
      expect(pinDropGapMs(0)).toBe(350);
    });

    it("shows everything at once under reduced motion (no initial offset)", () => {
      const { container } = renderLine();
      for (const pin of pins(container)) {
        expect(pin.style.opacity).toBe("1");
      }
    });

    it("starts the pins hidden and staggered when motion is allowed", () => {
      motion.reduced = false;
      const { container } = renderLine();
      for (const pin of pins(container)) {
        expect(pin.style.opacity).toBe("0");
      }
    });
  });
});
