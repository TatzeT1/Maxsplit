import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/sound/game-sounds", () => ({
  playDrumrollSound: vi.fn(),
  playSwordSound: vi.fn(),
  playStampSound: vi.fn(),
  playLaughSound: vi.fn(),
  playMissSound: vi.fn(),
  playAppliedSound: vi.fn(),
}));

// Mock the hook, not the media query (motion-dom reads the preference once per
// module instance, and jsdom has no matchMedia).
const motion = vi.hoisted(() => ({ reduced: true }));
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduced,
}));

import { LocaleProvider } from "@/components/locale-provider";
import { STECHEN_HOLD_MS } from "@/components/groups/split-game/dice-stechen-takeover";
import type { CatchFlashState } from "@/components/groups/split-game/use-catch-flashes";
import { formatMoney } from "@/lib/format/money";
import {
  EstimateCatchFlash,
  EstimateRevealView,
  type EstimateCatches,
  type EstimateRevealRound,
} from "./estimate-reveal";
import {
  DEGREES_QUESTION,
  ENTRANTS,
  MEMBERS,
  RATIO_QUESTION,
  bandTieRound,
  decidedRound,
  makeReveal,
  makeRound,
  makeStage,
} from "./estimate-test-data";

interface CatchEachCall {
  uids: readonly string[];
  options: { delayMs?: number; finale?: boolean; onDone?: () => void };
}

function fakeCatches() {
  const calls: CatchEachCall[] = [];
  const catches = {
    shake: vi.fn(),
    flash: null,
    active: false,
    isActive: () => false,
    catchOne: vi.fn(),
    catchEach: vi.fn((uids: readonly string[], options: CatchEachCall["options"] = {}) => {
      calls.push({ uids, options });
    }),
    cancel: vi.fn(),
  } satisfies EstimateCatches;
  return { catches, calls };
}

function renderReveal(
  round: EstimateRevealRound,
  options: Partial<React.ComponentProps<typeof EstimateRevealView>> = {},
) {
  const { catches, calls } = fakeCatches();
  const onSettled = vi.fn();
  const view = render(
    <LocaleProvider initialLocale="de">
      <EstimateRevealView
        round={round}
        stageIndex={0}
        members={MEMBERS}
        animate
        inDialog={false}
        catches={catches}
        onSettled={onSettled}
        {...options}
      />
    </LocaleProvider>,
  );
  return { catches, calls, onSettled, ...view };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const rows = () => screen.getAllByRole("listitem");

describe("EstimateRevealView", () => {
  beforeEach(() => {
    motion.reduced = true;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("a stage that is not revealed", () => {
    it("renders nothing — a guessing stage has no truth to show", () => {
      const round = makeRound([makeStage(RATIO_QUESTION, ["lea", "max"], null)]);
      const { container, onSettled } = renderReveal(round);
      expect(container).toBeEmptyDOMElement();
      expect(onSettled).not.toHaveBeenCalled();
    });

    it("renders nothing even for a malformed document that carries a reveal on a guessing stage", () => {
      const leaked = makeReveal(RATIO_QUESTION, 2_962_000, [
        { uid: "lea", guess: 1, fate: "safe" },
      ]);
      const stage = { ...makeStage(RATIO_QUESTION, ["lea", "max"], null), reveal: leaked };
      const { container } = renderReveal(makeRound([stage]));
      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing for a stage index that does not exist", () => {
      const { container } = renderReveal(decidedRound(), { stageIndex: 3 });
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("the order of the reveal (motion allowed)", () => {
    beforeEach(() => {
      motion.reduced = false;
    });

    it("shows the pins first, the truth after them, the ranking after that — and the slips last", () => {
      const { catches } = renderReveal(decidedRound());
      // Pins only.
      expect(screen.queryByText("Richtig ist")).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.queryByText(/2\.962/)).toBeNull();
      expect(catches.catchEach).not.toHaveBeenCalled();

      advance(3 * 350 + 450);
      expect(screen.getByText("Richtig ist")).toBeInTheDocument();
      expect(screen.getByText(/2\.962/)).toBeInTheDocument();
      expect(screen.queryByRole("list")).toBeNull();

      advance(700);
      expect(screen.getAllByRole("list").length).toBe(1);
      expect(catches.catchEach).not.toHaveBeenCalled();

      advance(900);
      expect(catches.catchEach).toHaveBeenCalledTimes(1);
    });

    it("never calls the step delays zero", () => {
      renderReveal(decidedRound());
      advance(100);
      expect(screen.queryByText("Richtig ist")).toBeNull();
    });

    it("puts the truth after the number line and before the ranking in the document", () => {
      const { container } = renderReveal(decidedRound());
      advance(3 * 350 + 450);
      advance(700);
      const html = container.innerHTML;
      const line = html.indexOf("estimate-number-line");
      const truth = html.indexOf("estimate-truth");
      const ranking = html.indexOf("<ol");
      expect(line).toBeGreaterThan(-1);
      expect(truth).toBeGreaterThan(line);
      expect(ranking).toBeGreaterThan(truth);
    });
  });

  describe("under reduced motion", () => {
    it("reaches the full reveal at once, in the same order", () => {
      renderReveal(decidedRound());
      expect(screen.getByText("Richtig ist")).toBeInTheDocument();
      expect(screen.getByRole("list")).toBeInTheDocument();
    });

    it("still plays the slips, then the banner", () => {
      const { calls } = renderReveal(decidedRound(), {
        stake: { description: "Pizza", amountMinor: 3000, currency: "EUR" },
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].uids).toEqual(["ben"]);
      expect(calls[0].options.finale).toBe(true);
      expect(screen.queryByText("Ben zahlt.", { exact: false })).toBeNull();
      act(() => calls[0].options.onDone?.());
      expect(screen.getAllByText("Ben zahlt.").length).toBeGreaterThan(0);
    });
  });

  describe("the content", () => {
    it("tells the truth with its source and year", () => {
      renderReveal(decidedRound());
      const truth = document.querySelector("[data-slot='estimate-truth']") as HTMLElement;
      expect(truth).toHaveTextContent("Richtig ist");
      expect(truth).toHaveTextContent(/2\.962\sm/);
      expect(truth).toHaveTextContent("Quelle: Testamt (fiktiv), Stand 2024");
    });

    it("ranks furthest first, with direction words and the fate as text", () => {
      renderReveal(decidedRound());
      const items = rows();
      expect(items.map((item) => item.dataset.uid)).toEqual(["ben", "max", "lea"]);
      expect(within(items[0]).getByText("zahlt")).toBeInTheDocument();
      expect(items[0]).toHaveTextContent("Faktor 2,7 zu hoch");
      expect(items[1]).toHaveTextContent("Faktor 2,47 zu niedrig");
      expect(within(items[1]).getByText("sicher")).toBeInTheDocument();
      // Under 5 % off, "Faktor 1" would lie: it is told as a percentage.
      expect(items[2]).toHaveTextContent("2,1 % zu niedrig");
    });

    it("gives the ranking an accessible name, and lets assistive technology skip the line", () => {
      const { container } = renderReveal(decidedRound());
      expect(screen.getByRole("list", { name: "Wer liegt wie weit daneben?" })).toBeInTheDocument();
      expect(container.querySelector("[data-slot='estimate-number-line']")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });

    it("tags the current player, the time an online guess took and who typed a one-phone guess", () => {
      const truth = 2_962_000;
      const reveal = makeReveal(RATIO_QUESTION, truth, [
        { uid: "ben", guess: 8_000_000, fate: "pays", answeredAfterMs: 12_000 },
        { uid: "max", guess: 1_200_000, fate: "safe", enteredBy: "lea" },
      ]);
      const round = makeRound([makeStage(RATIO_QUESTION, ["max", "ben"], reveal)], {
        status: "finished",
        loserUids: ["ben"],
        resolvedBy: "distance",
      });
      renderReveal(round, { currentUid: "ben" });
      const [benRow, maxRow] = rows();
      expect(within(benRow).getByText("du")).toBeInTheDocument();
      expect(benRow).toHaveTextContent("nach 12 s");
      expect(maxRow).toHaveTextContent("eingetragen von Lea");
      expect(within(maxRow).queryByText("du")).toBeNull();
    });

    it("lists a player without a guess as 'kein Tipp', as payer", () => {
      const reveal = makeReveal(RATIO_QUESTION, 2_962_000, [
        { uid: "tom", guess: null, fate: "pays" },
        { uid: "lea", guess: 2_900_000, fate: "safe" },
      ]);
      const round = makeRound([makeStage(RATIO_QUESTION, ["tom", "lea"], reveal)], {
        status: "finished",
        loserUids: ["tom"],
        resolvedBy: "distance",
      });
      renderReveal(round);
      const [tomRow] = rows();
      expect(tomRow).toHaveTextContent("kein Tipp");
      expect(within(tomRow).getByText("zahlt")).toBeInTheDocument();
    });

    it("falls back to the round's name snapshot for a member who has left", () => {
      renderReveal(decidedRound(), { members: { lea: MEMBERS.lea } });
      expect(rows()[0]).toHaveTextContent("Ben");
    });
  });

  describe("the tolerance case (E2b: truth 100, tolerance 1, guesses 90 and 111)", () => {
    it("says 'Stechen' on both rows and explains the band", () => {
      renderReveal(bandTieRound());
      const items = rows();
      expect(items.map((item) => item.dataset.uid)).toEqual(["max", "lea", "ben"]);
      expect(within(items[0]).getByText("Stechen")).toBeInTheDocument();
      expect(within(items[1]).getByText("Stechen")).toBeInTheDocument();
      expect(within(items[2]).getByText("sicher")).toBeInTheDocument();
      expect(
        screen.getByText(/Die Quellen sind sich bei dieser Zahl nicht ganz einig/),
      ).toBeInTheDocument();
    });

    it("shows no tolerance note when the band did not decide anything", () => {
      renderReveal(decidedRound());
      expect(screen.queryByText(/Die Quellen sind sich/)).toBeNull();
    });

    it("plays no slip (nobody certainly pays), then the Stechfrage takeover, then settles", () => {
      const { calls, onSettled } = renderReveal(bandTieRound());
      expect(calls).toHaveLength(1);
      expect(calls[0].uids).toEqual([]);
      expect(calls[0].options.finale).toBe(false);
      expect(screen.queryByText("Stechfrage!")).toBeNull();
      act(() => calls[0].options.onDone?.());
      expect(screen.getByText("Stechfrage!")).toBeInTheDocument();
      expect(
        screen.getByText("Nur ihr tippt nochmal — wer weiter danebenliegt, zahlt."),
      ).toBeInTheDocument();
      // Reduced motion: no hold, the takeover is gone at once and the round moves on.
      advance(0);
      expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it("holds the takeover for the dice game's time when motion is allowed", () => {
      motion.reduced = false;
      const { calls, onSettled } = renderReveal(bandTieRound());
      advance(3 * 350 + 450);
      advance(700);
      advance(900);
      expect(calls).toHaveLength(1);
      act(() => calls[0].options.onDone?.());
      expect(screen.getAllByText("Stechfrage!").length).toBeGreaterThan(0);
      expect(onSettled).not.toHaveBeenCalled();
      advance(STECHEN_HOLD_MS);
      expect(onSettled).toHaveBeenCalledTimes(1);
    });
  });

  describe("slips", () => {
    function fourPlayerRound() {
      const truth = 100_000;
      const reveal = makeReveal(DEGREES_QUESTION, truth, [
        { uid: "tom", guess: 200_000, fate: "pays" },
        { uid: "ben", guess: 10_000, fate: "pays" },
        { uid: "max", guess: 120_000, fate: "safe" },
        { uid: "lea", guess: 99_000, fate: "safe" },
      ]);
      return makeRound(
        [makeStage(DEGREES_QUESTION, ["lea", "max", "ben", "tom"], reveal, { slots: 2 })],
        {
          status: "finished",
          targetLoserCount: 2,
          loserUids: ["tom", "ben"],
          resolvedBy: "distance",
        },
      );
    }

    it("plays them closest payer first, furthest last, so the finale lands on the furthest", () => {
      const { calls } = renderReveal(fourPlayerRound());
      // `reveal.payers` is furthest first (tom, ben); the slips run in reverse.
      expect(calls[0].uids).toEqual(["ben", "tom"]);
      expect(calls[0].options.finale).toBe(true);
    });

    it("plays the lot's picks after the certain payers when a draw decided", () => {
      const reveal = makeReveal(
        RATIO_QUESTION,
        2_962_000,
        [
          { uid: "lea", guess: 1_000_000, fate: "contested" },
          { uid: "max", guess: 1_000_000, fate: "contested" },
          { uid: "ben", guess: 2_962_000, fate: "safe" },
        ],
        { next: "shuffle", slotsLeft: 1, shuffled: ["max", "lea"], lotPayers: ["max"] },
      );
      const round = makeRound([makeStage(RATIO_QUESTION, ["lea", "max", "ben"], reveal)], {
        status: "finished",
        loserUids: ["max"],
        resolvedBy: "shuffle",
      });
      const { calls, onSettled } = renderReveal(round);
      expect(calls).toHaveLength(1);
      expect(calls[0].uids).toEqual([]);
      expect(calls[0].options.finale).toBe(false);
      expect(screen.queryByText(/das Los entscheidet/)).toBeNull();
      act(() => calls[0].options.onDone?.());
      expect(
        screen.getByText("Auch nach drei Stechfragen gleichauf — das Los entscheidet."),
      ).toBeInTheDocument();
      expect(calls).toHaveLength(2);
      expect(calls[1].uids).toEqual(["max"]);
      expect(calls[1].options.finale).toBe(true);
      // The lot's pick pays, the other contested player is safe.
      const maxRow = rows().find((row) => row.dataset.uid === "max") as HTMLElement;
      const leaRow = rows().find((row) => row.dataset.uid === "lea") as HTMLElement;
      expect(within(maxRow).getByText("zahlt")).toBeInTheDocument();
      expect(within(leaRow).getByText("sicher")).toBeInTheDocument();
      act(() => calls[1].options.onDone?.());
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText("Max zahlt.").length).toBeGreaterThan(0);
    });

    it("says so when nobody among the lot's players guessed", () => {
      const reveal = makeReveal(
        RATIO_QUESTION,
        2_962_000,
        [
          { uid: "tom", guess: null, fate: "contested" },
          { uid: "max", guess: null, fate: "contested" },
          { uid: "lea", guess: 2_962_000, fate: "safe" },
        ],
        { next: "shuffle", slotsLeft: 1, shuffled: ["tom", "max"], lotPayers: ["tom"] },
      );
      const round = makeRound([makeStage(RATIO_QUESTION, ["lea", "max", "tom"], reveal)], {
        status: "finished",
        loserUids: ["tom"],
        resolvedBy: "shuffle",
      });
      const { calls } = renderReveal(round);
      act(() => calls[0].options.onDone?.());
      expect(
        screen.getByText("Niemand von euch hat getippt — das Los entscheidet."),
      ).toBeInTheDocument();
    });
  });

  describe("static mode (a finished round opened later, a history entry)", () => {
    it("shows everything at once, with no slips and no sound, and settles", () => {
      motion.reduced = false;
      const { catches, onSettled } = renderReveal(decidedRound(), { animate: false });
      expect(screen.getByText("Richtig ist")).toBeInTheDocument();
      expect(screen.getByRole("list")).toBeInTheDocument();
      expect(screen.getAllByText("Ben zahlt.").length).toBeGreaterThan(0);
      expect(catches.catchEach).not.toHaveBeenCalled();
      expect(catches.shake).not.toHaveBeenCalled();
      expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it("prints each payer's share under the verdict when there is a stake", () => {
      const { container } = renderReveal(decidedRound(), {
        animate: false,
        stake: { description: "Pizza", amountMinor: 3000, currency: "EUR" },
      });
      expect(container).toHaveTextContent(`Ben: ${formatMoney(3000, "EUR")}`.replace(/\s/g, " "));
    });
  });
});

describe("EstimateCatchFlash", () => {
  beforeEach(() => {
    motion.reduced = true;
  });

  const flash = (uid: string): CatchFlashState => ({
    id: 1,
    uid,
    finale: true,
    index: 0,
    count: 1,
  });

  function renderFlash(
    round: EstimateRevealRound,
    uid: string,
    stake?: { description: string; amountMinor: number; currency: string },
  ) {
    return render(
      <LocaleProvider initialLocale="de">
        <EstimateCatchFlash
          flash={flash(uid)}
          round={round}
          stageIndex={0}
          members={MEMBERS}
          stake={stake}
        />
      </LocaleProvider>,
    );
  }

  it("stamps 'Daneben!' with the error and the share", () => {
    const { container } = renderFlash(decidedRound(), "ben", {
      description: "Pizza",
      amountMinor: 3000,
      currency: "EUR",
    });
    expect(container).toHaveTextContent("Ben");
    expect(container).toHaveTextContent("Daneben!");
    expect(container).toHaveTextContent("Faktor 2,7 zu hoch");
    expect(container).toHaveTextContent(
      formatMoney(3000, "EUR").replace(/\s/g, " ").replace(/ /g, " "),
    );
  });

  it("stamps 'Kein Tipp!' for an absentee", () => {
    const reveal = makeReveal(RATIO_QUESTION, 2_962_000, [
      { uid: "tom", guess: null, fate: "pays" },
      { uid: "lea", guess: 2_900_000, fate: "safe" },
    ]);
    const round = makeRound([makeStage(RATIO_QUESTION, ["tom", "lea"], reveal)], {
      loserUids: ["tom"],
    });
    const { container } = renderFlash(round, "tom");
    expect(container).toHaveTextContent("Kein Tipp!");
  });

  it("stamps 'Das Los!' for a pick of the draw", () => {
    const reveal = makeReveal(
      RATIO_QUESTION,
      2_962_000,
      [
        { uid: "lea", guess: 1_000_000, fate: "contested" },
        { uid: "max", guess: 1_000_000, fate: "contested" },
      ],
      { next: "shuffle", shuffled: ["max", "lea"], lotPayers: ["max"], slotsLeft: 1 },
    );
    const round = makeRound([makeStage(RATIO_QUESTION, ["lea", "max"], reveal)], {
      loserUids: ["max"],
    });
    const { container } = renderFlash(round, "max");
    expect(container).toHaveTextContent("Das Los!");
    expect(container).toHaveTextContent("Per Los bestimmt");
  });

  it("splits a stake in booking order: the furthest payer carries the odd cent", () => {
    const truth = 100_000;
    const reveal = makeReveal(DEGREES_QUESTION, truth, [
      { uid: "tom", guess: 200_000, fate: "pays" },
      { uid: "ben", guess: 10_000, fate: "pays" },
      { uid: "lea", guess: 99_000, fate: "safe" },
    ]);
    const round = makeRound(
      [makeStage(DEGREES_QUESTION, ["lea", "ben", "tom"], reveal, { slots: 2 })],
      {
        targetLoserCount: 2,
        loserUids: ["tom", "ben"],
        entrants: ENTRANTS,
      },
    );
    const stake = { description: "Pizza", amountMinor: 1001, currency: "EUR" };
    const furthest = renderFlash(round, "tom", stake);
    expect(furthest.container).toHaveTextContent(/5,01/);
    furthest.unmount();
    const closer = renderFlash(round, "ben", stake);
    expect(closer.container).toHaveTextContent(/5,00/);
  });
});
