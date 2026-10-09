import { act, render } from "@testing-library/react";
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
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduced,
}));

import { LocaleProvider } from "@/components/locale-provider";
import { EstimateGuessPanel } from "./estimate-guess-input";
import { EstimateHandOver } from "./estimate-hand-over";
import { EstimateNumberLine } from "./estimate-number-line";
import { EstimateQuestionCard } from "./estimate-question-card";
import { EstimateRevealView } from "./estimate-reveal";
import {
  MEMBERS,
  RATIO_QUESTION,
  TRUTH_SOURCE,
  decidedRound,
  makeReveal,
  makeRound,
  makeStage,
} from "./estimate-test-data";

// The truth of decidedRound(): 2 962 m, from "Testamt (fiktiv)", as of 2024.
const SECRETS = [
  "2962",
  "2.962",
  "2,962",
  TRUTH_SOURCE.label,
  TRUTH_SOURCE.url,
  "Fixture data",
  "Richtig ist",
  "Quelle",
];

/** Everything a page could leak through: text, every attribute value, live regions. */
function surface(container: HTMLElement): string {
  const parts: string[] = [container.textContent ?? ""];
  for (const element of container.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) parts.push(attribute.value);
  }
  return parts.join("\n");
}

function expectNoTruth(container: HTMLElement) {
  const everything = surface(container);
  for (const secret of SECRETS) expect(everything).not.toContain(secret);
}

function wrap(ui: React.ReactNode) {
  return render(<LocaleProvider initialLocale="de">{ui}</LocaleProvider>);
}

const catches = {
  shake: vi.fn(),
  flash: null,
  active: false,
  isActive: () => false,
  catchOne: vi.fn(),
  catchEach: vi.fn(),
  cancel: vi.fn(),
};

describe("no component shows a truth before its stage is revealed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    motion.reduced = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("the question card", () => {
    const { container } = wrap(
      <EstimateQuestionCard question={RATIO_QUESTION} stageIndex={0} stageKind="main" />,
    );
    expectNoTruth(container);
  });

  it("the guess panel", () => {
    const { container } = wrap(
      <EstimateGuessPanel
        question={RATIO_QUESTION}
        stageIndex={0}
        stageKind="main"
        heading="Lea tippt"
        onLock={() => {}}
      />,
    );
    expectNoTruth(container);
  });

  it("the hand-over screen", () => {
    const { container } = wrap(
      <EstimateHandOver name="Lea" position={1} total={3} onReady={() => {}} />,
    );
    expectNoTruth(container);
  });

  it("the reveal view of a stage that is still guessing — even if the document carried a reveal", () => {
    const leaked = decidedRound().stages[0].reveal;
    const stage = { ...makeStage(RATIO_QUESTION, ["lea", "max"], null), reveal: leaked };
    const { container } = wrap(
      <EstimateRevealView
        round={makeRound([stage])}
        stageIndex={0}
        members={MEMBERS}
        animate
        inDialog={false}
        catches={catches}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("the number line at step 'pins': no truth in text, attributes or live regions", () => {
    const reveal = decidedRound().stages[0].reveal;
    if (!reveal) throw new Error("fixture");
    const { container } = wrap(
      <EstimateNumberLine
        question={RATIO_QUESTION}
        reveal={reveal}
        names={{ lea: "Lea", max: "Max", ben: "Ben" }}
        step="pins"
      />,
    );
    expectNoTruth(container);
    expect(container.querySelectorAll("[aria-live], [role='status'], [role='alert']")).toHaveLength(
      0,
    );
  });

  it("the animated reveal while only the pins are on screen", () => {
    const { container } = wrap(
      <EstimateRevealView
        round={decidedRound()}
        stageIndex={0}
        members={MEMBERS}
        animate
        inDialog={false}
        catches={catches}
      />,
    );
    expectNoTruth(container);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expectNoTruth(container);
  });

  it("…and then shows the truth only once the truth step has come", () => {
    const { container } = wrap(
      <EstimateRevealView
        round={decidedRound()}
        stageIndex={0}
        members={MEMBERS}
        animate
        inDialog={false}
        catches={catches}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(3 * 350 + 450);
    });
    expect(surface(container)).toContain("2.962");
  });

  it("an unrevealed Stechfrage after a revealed stage shows nothing of the next stage's truth", () => {
    const first = makeReveal(RATIO_QUESTION, 2_962_000, [
      { uid: "lea", guess: 1_000_000, fate: "contested" },
      { uid: "max", guess: 1_000_000, fate: "contested" },
    ]);
    const round = makeRound([
      makeStage(RATIO_QUESTION, ["lea", "max"], first),
      makeStage({ ...RATIO_QUESTION, id: "est-geo-9099" }, ["lea", "max"], null, {
        index: 1,
        kind: "stechen",
      }),
    ]);
    const { container } = wrap(
      <EstimateRevealView
        round={round}
        stageIndex={1}
        members={MEMBERS}
        animate={false}
        inDialog={false}
        catches={catches}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
