import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The question comes from the server-only bank: every action is a mock.
const mocks = vi.hoisted(() => ({
  online: true,
  create: vi.fn(),
  submit: vi.fn(),
  cancel: vi.fn(),
  createOnline: vi.fn(),
}));
vi.mock("@/lib/actions/estimate-rounds", () => ({
  createLocalEstimateRound: mocks.create,
  submitLocalEstimateGuesses: mocks.submit,
  cancelEstimateRound: mocks.cancel,
  createEstimateRound: mocks.createOnline,
}));
vi.mock("@/lib/use-online", () => ({ useOnline: () => mocks.online }));
// Reduced motion: the reveal starts at its slips, so a round plays out in a few seconds of fake time.
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

import { LocaleProvider } from "@/components/locale-provider";
import { GameRoundProvider } from "@/components/groups/split-game/game-round";
import {
  MEMBERS,
  RATIO_QUESTION,
  TRUTH_SOURCE,
  bandTieRound,
  decidedRound,
  DEGREES_QUESTION,
  makeReveal,
  makeRound,
  makeStage,
} from "@/components/groups/split-game/estimate/estimate-test-data";
import { formatMoney } from "@/lib/format/money";
import type { GameStake } from "@/lib/games/payers";
import { de } from "@/lib/i18n/de";
import type { GameExpenseDraft, GroupMember } from "@/lib/types";
import { SplitEstimateDialog } from "./split-estimate-dialog";

// The rules are covered by estimate-rules.test.ts and the flow by
// use-local-estimate-flow.test.ts; this pins how the dialog wires them: the
// setup, the hand-over that never shows a guess, the one call that scores a
// stage, and what reaches `onResolve`.

const members: Record<string, GroupMember> = {
  lea: MEMBERS.lea,
  max: MEMBERS.max,
  ben: MEMBERS.ben,
};
const uids = ["lea", "max", "ben"];

const DRAFT: GameExpenseDraft = {
  description: "Pizza",
  amountMinor: 3000,
  currency: "EUR",
  date: "2026-05-01",
  category: null,
  emoji: null,
  paidBy: { lea: 3000 },
};

const mainStage = () => makeStage(RATIO_QUESTION, uids, null);
const started = () => ({ ok: true as const, data: { roundId: "round1", stage: mainStage() } });
const scored = () => ({ ok: true as const, data: { round: decidedRound() } });

/** Guesses the tests type: Lea 2 900 m, Max 1 200 m, Ben 8 000 m (decidedRound: Ben pays). */
const TYPED: Record<string, string> = { lea: "2900", max: "1200", ben: "8000" };
const MILLI: Record<string, number> = { lea: 2_900_000, max: 1_200_000, ben: 8_000_000 };

const euros = (minor: number) => formatMoney(minor, "EUR").replace(/\s/g, " ");

const startRound = vi.fn();
const onResolve = vi.fn();
const onOpenChange = vi.fn();
const onRoundStarted = vi.fn();

function dialog(props: Partial<React.ComponentProps<typeof SplitEstimateDialog>> = {}) {
  return (
    <LocaleProvider initialLocale="de">
      <GameRoundProvider value={{ round: 1, startRound }}>
        <SplitEstimateDialog
          open
          onOpenChange={onOpenChange}
          members={members}
          memberUids={uids}
          groupId="g1"
          onResolve={onResolve}
          {...props}
        />
      </GameRoundProvider>
    </LocaleProvider>
  );
}

function renderDialog(props: Partial<React.ComponentProps<typeof SplitEstimateDialog>> = {}) {
  const view = render(dialog(props));
  return { ...view, again: (next = props) => view.rerender(dialog(next)) };
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

async function clickStart(label = "Frage ziehen") {
  await act(async () => {
    fireEvent.click(button(label));
  });
}

function text(): string {
  return document.body.textContent ?? "";
}

/** The seat's hand-over, then typing and locking. */
function playSeat(uid: string, typed = TYPED[uid]) {
  fireEvent.click(button(`Ich bin ${members[uid].displayName}`));
  const field = screen.getByRole("textbox") as HTMLInputElement;
  expect(field.value).toBe("");
  fireEvent.change(field, { target: { value: typed } });
  fireEvent.click(button("Tipp sperren"));
}

/** setup -> intro -> every seat locked -> the "all in" screen. */
async function playToAllIn() {
  await clickStart();
  fireEvent.click(button("Los, der Reihe nach"));
  for (const uid of uids) playSeat(uid);
  expect(screen.getByText("Alle haben getippt.")).toBeInTheDocument();
}

async function reveal() {
  await act(async () => {
    fireEvent.click(button("Auflösung zeigen"));
  });
}

/** Long enough for the reveal, every slip of a one-payer round and the verdict. */
function playOut() {
  wait(15_000);
}

describe("SplitEstimateDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    mocks.online = true;
    mocks.create.mockReset().mockResolvedValue(started());
    mocks.submit.mockReset().mockResolvedValue(scored());
    mocks.cancel.mockReset().mockResolvedValue({ ok: true, data: null });
    mocks.createOnline.mockReset().mockResolvedValue({ ok: true, data: { roundId: "online1" } });
    startRound.mockReset();
    onResolve.mockReset();
    onOpenChange.mockReset();
    onRoundStarted.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("setup", () => {
    it("starts with everyone in the pool and one payer, and caps the payers at everyone but one", () => {
      renderDialog();
      expect(screen.getByRole("checkbox", { name: "Lea" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Ben" })).toBeChecked();
      const more = button("Mehr");
      const fewer = button("Weniger");
      expect(fewer).toBeDisabled();
      fireEvent.click(more);
      expect(more).toBeDisabled();
      fireEvent.click(fewer);
      expect(fewer).toBeDisabled();
      // Two players: one payer at most.
      fireEvent.click(screen.getByRole("checkbox", { name: "Ben" }));
      expect(button("Mehr")).toBeDisabled();
    });

    it("needs two players to start", () => {
      renderDialog();
      expect(button("Frage ziehen")).toBeEnabled();
      fireEvent.click(screen.getByRole("checkbox", { name: "Ben" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Max" }));
      expect(button("Frage ziehen")).toBeDisabled();
    });

    it("draws the question with the pool, the payer count and the fun toggle off by default", async () => {
      renderDialog();
      const toggle = screen.getByRole("switch", { name: "Auch freche Fun Facts" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      fireEvent.click(button("Mehr"));
      await clickStart();
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.create).toHaveBeenCalledWith({
        groupId: "g1",
        poolUids: uids,
        targetLoserCount: 2,
        includeFun: false,
      });
      expect(startRound).toHaveBeenCalledTimes(1);
    });

    it("passes the fun toggle on, forgets it when the dialog closes, and keeps it across „Neu starten“", async () => {
      renderDialog();
      fireEvent.click(screen.getByRole("switch", { name: "Auch freche Fun Facts" }));
      await clickStart();
      expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ includeFun: true }));

      // Through to the verdict, then „Neu starten“: the setup shows the toggle unchanged.
      fireEvent.click(button("Los, der Reihe nach"));
      for (const uid of uids) playSeat(uid);
      await reveal();
      playOut();
      fireEvent.click(button("Neu starten"));
      expect(screen.getByRole("switch", { name: "Auch freche Fun Facts" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await clickStart();
      expect(mocks.create).toHaveBeenCalledTimes(2);
      expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ includeFun: true }));
      // Every round counts as an attempt.
      expect(startRound).toHaveBeenCalledTimes(2);
    });

    it("does not remember the toggle after the dialog was closed", () => {
      renderDialog();
      fireEvent.click(screen.getByRole("switch", { name: "Auch freche Fun Facts" }));
      expect(screen.getByRole("switch", { name: "Auch freche Fun Facts" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      fireEvent.click(button("Schließen"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.getByRole("switch", { name: "Auch freche Fun Facts" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });

    it("offers no window picker on one phone", () => {
      renderDialog({ expenseDraft: DRAFT, onRoundStarted });
      expect(screen.queryByText(de.expenses.estimateWindowLabel)).toBeNull();
    });
  });

  describe("offline", () => {
    it("disables the start and says why, in a visible alert", () => {
      mocks.online = false;
      renderDialog();
      expect(button("Frage ziehen")).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(de.expenses.estimateNeedsConnection);
    });

    it("shows no alert while online", () => {
      renderDialog();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("never calls the action while offline", () => {
      mocks.online = false;
      renderDialog();
      fireEvent.click(button("Frage ziehen"));
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe("where to play", () => {
    it("offers online only when the form can book the bill", () => {
      renderDialog({ expenseDraft: undefined });
      const online = screen.getByRole("radio", { name: /Online/ });
      expect(online).toBeDisabled();
      expect(online).toHaveTextContent("Nur beim Hinzufügen einer neuen Ausgabe.");
    });

    it("says why online is not possible when someone in the pool has no account", () => {
      renderDialog({
        expenseDraft: DRAFT,
        onRoundStarted,
        members: { ...members, ben: { ...MEMBERS.ben, isPlaceholder: true } },
      });
      const online = screen.getByRole("radio", { name: /Online/ });
      expect(online).toBeDisabled();
      expect(online).toHaveTextContent(de.expenses.estimatePlaceOnlinePlaceholderHint);
    });

    it("is available with a complete bill, and starts an online round with the window and the draft", async () => {
      renderDialog({ expenseDraft: DRAFT, onRoundStarted });
      fireEvent.click(screen.getByRole("radio", { name: /Online/ }));
      // 5 minutes unless picked otherwise.
      expect(screen.getByRole("radio", { name: "5 Min." })).toHaveAttribute("aria-checked", "true");
      await clickStart("Runde verschicken");
      expect(mocks.createOnline).toHaveBeenCalledWith({
        groupId: "g1",
        poolUids: uids,
        targetLoserCount: 1,
        includeFun: false,
        answerWindowMs: 300_000,
        autoBook: DRAFT,
      });
      expect(onRoundStarted).toHaveBeenCalledWith("online1");
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("sends the picked window", async () => {
      renderDialog({ expenseDraft: DRAFT, onRoundStarted });
      fireEvent.click(screen.getByRole("radio", { name: /Online/ }));
      fireEvent.click(screen.getByRole("radio", { name: "15 Min." }));
      await clickStart("Runde verschicken");
      expect(mocks.createOnline).toHaveBeenCalledWith(
        expect.objectContaining({ answerWindowMs: 900_000 }),
      );
    });

    it("says the bill is missing when the form is not complete yet", async () => {
      renderDialog({ expenseDraft: null, onRoundStarted });
      fireEvent.click(screen.getByRole("radio", { name: /Online/ }));
      await clickStart("Runde verschicken");
      expect(mocks.createOnline).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(de.expenses.duelNeedsExpense);
    });

    it("maps an online start error", async () => {
      mocks.createOnline.mockResolvedValue({ ok: false, error: "round-running" });
      renderDialog({ expenseDraft: DRAFT, onRoundStarted });
      fireEvent.click(screen.getByRole("radio", { name: /Online/ }));
      await clickStart("Runde verschicken");
      expect(screen.getByRole("alert")).toHaveTextContent(de.expenses.estimateRoundRunning);
      expect(onRoundStarted).not.toHaveBeenCalled();
    });
  });

  describe("start errors", () => {
    it.each([
      ["round-running", de.expenses.estimateRoundRunning],
      ["rate-limited", de.expenses.estimateRateLimited],
      ["bank-empty", de.expenses.estimateBankEmpty],
      ["invalid-pool", de.expenses.estimatePlaceOnlinePlaceholderHint],
      ["something-else", de.expenses.estimateStartError],
    ])("shows %s and lets the table try again", async (code, message) => {
      mocks.create.mockResolvedValueOnce({ ok: false, error: code });
      renderDialog();
      await clickStart();
      expect(screen.getByRole("alert")).toHaveTextContent(message);
      expect(startRound).not.toHaveBeenCalled();
      expect(button("Frage ziehen")).toBeEnabled();
      await clickStart();
      expect(screen.getByText("Das ist die Frage")).toBeInTheDocument();
    });

    it("turns a thrown call into a visible message, never a spinner that stays", async () => {
      mocks.create.mockRejectedValueOnce(new Error("offline"));
      renderDialog();
      await clickStart();
      expect(screen.getByRole("alert")).toHaveTextContent(de.errors.notSaved);
      expect(button("Frage ziehen")).toBeEnabled();
    });
  });

  describe("one phone", () => {
    it("shows the question, hands the phone round, and never shows a guess during a hand-over", async () => {
      renderDialog();
      await clickStart();
      expect(screen.getByText(RATIO_QUESTION.text.de)).toBeInTheDocument();
      fireEvent.click(button("Los, der Reihe nach"));
      expect(screen.getByText("Handy an Lea")).toBeInTheDocument();
      expect(screen.getAllByText("Tipp 1 von 3").length).toBeGreaterThan(0);
      // The hand-over has no question and no field.
      expect(screen.queryByRole("textbox")).toBeNull();

      playSeat("lea");
      expect(screen.getByText("Handy an Max")).toBeInTheDocument();
      expect(screen.getAllByText("Tipp 2 von 3").length).toBeGreaterThan(0);
      // Lea's number is nowhere — not as typed, not grouped, not in a field.
      expect(text()).not.toContain("2900");
      expect(text()).not.toContain("2.900");

      // The next seat's field starts empty.
      fireEvent.click(button("Ich bin Max"));
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
      expect(screen.getByRole("textbox")).toHaveAccessibleName("Max tippt — in Meter");
    });

    it("scores once with every seat's guess, in milli, after the last lock", async () => {
      renderDialog();
      await playToAllIn();
      expect(mocks.submit).not.toHaveBeenCalled();
      await reveal();
      expect(mocks.submit).toHaveBeenCalledTimes(1);
      expect(mocks.submit).toHaveBeenCalledWith({
        groupId: "g1",
        roundId: "round1",
        stageIndex: 0,
        guessesMilli: MILLI,
      });
    });

    it("shows no part of the truth before the reveal — not in text, not in an attribute", async () => {
      renderDialog();
      await clickStart();
      const surface = () => {
        const parts = [document.body.textContent ?? ""];
        for (const element of document.body.querySelectorAll("*")) {
          for (const attribute of Array.from(element.attributes)) parts.push(attribute.value);
        }
        return parts.join("\n");
      };
      const secrets = [
        "2962",
        "2.962",
        "2,962",
        TRUTH_SOURCE.label,
        TRUTH_SOURCE.url,
        "Fixture data",
        de.expenses.estimateTruthLabel,
        "Quelle:",
      ];
      const expectNoTruth = () => {
        for (const secret of secrets) expect(surface()).not.toContain(secret);
      };
      expectNoTruth();
      fireEvent.click(button("Los, der Reihe nach"));
      expectNoTruth();
      fireEvent.click(button("Ich bin Lea"));
      expectNoTruth();
      fireEvent.change(screen.getByRole("textbox"), { target: { value: TYPED.lea } });
      fireEvent.click(button("Tipp sperren"));
      expectNoTruth();
      playSeat("max");
      playSeat("ben");
      expectNoTruth();
      // The score call is in flight: still nothing.
      let resolveSubmit: (value: ReturnType<typeof scored>) => void = () => {};
      mocks.submit.mockReturnValueOnce(new Promise((resolve) => (resolveSubmit = resolve)));
      await reveal();
      expect(screen.getByRole("button", { name: "Wird ausgewertet …" })).toBeDisabled();
      expectNoTruth();
      await act(async () => resolveSubmit(scored()));
      playOut();
      expect(text().replace(/\s/g, " ")).toContain("2.962 m");
      expect(text()).toContain(TRUTH_SOURCE.label);
    });

    it("plays the reveal, announces the truth once, and hands the verdict to onResolve", async () => {
      renderDialog();
      await playToAllIn();
      await reveal();
      playOut();
      expect(screen.getAllByText("Ben zahlt.", { exact: false }).length).toBeGreaterThan(0);
      const status = screen
        .getAllByRole("status")
        .find((element) => element.textContent?.includes("richtig ist"));
      expect(status).toHaveTextContent("Auflösung: richtig ist 2.962 m.");
      expect(status).toHaveClass("sr-only");

      fireEvent.click(button("Übernehmen"));
      expect(onResolve).toHaveBeenCalledWith(["ben"], uids, { estimateRoundId: "round1" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("gives the payer a slip with the share they are booked for", async () => {
      const stake: GameStake = { description: "Pizza", amountMinor: 3000, currency: "EUR" };
      renderDialog({ stake });
      await playToAllIn();
      await reveal();
      wait(2000);
      expect(screen.getAllByText(`zahlt ${euros(3000)} · Pizza`).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Daneben!").length).toBeGreaterThan(0);
    });

    it("offers „Neu starten“ next to „Übernehmen“ and draws a new question", async () => {
      renderDialog();
      await playToAllIn();
      await reveal();
      playOut();
      expect(button("Neu starten")).toBeEnabled();
      fireEvent.click(button("Neu starten"));
      expect(onResolve).not.toHaveBeenCalled();
      expect(button("Frage ziehen")).toBeInTheDocument();
      // The truth of the round before is gone with it.
      expect(text()).not.toContain("2.962");
      await clickStart();
      expect(mocks.create).toHaveBeenCalledTimes(2);
    });

    describe("losing the connection before the score call", () => {
      it("keeps the guesses, disables the button and says so, and re-enables it online", async () => {
        const view = renderDialog();
        await playToAllIn();
        expect(button("Auflösung zeigen")).toBeEnabled();
        expect(screen.queryByText(de.expenses.estimateKeepOpen)).toBeNull();

        mocks.online = false;
        view.again();
        expect(button("Auflösung zeigen")).toBeDisabled();
        expect(screen.getByText(de.expenses.estimateKeepOpen)).toHaveAttribute("role", "status");

        mocks.online = true;
        view.again();
        expect(button("Auflösung zeigen")).toBeEnabled();
        await reveal();
        expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ guessesMilli: MILLI }));
      });

      it("keeps the guesses after a failed call and retries with the identical payload", async () => {
        mocks.submit.mockRejectedValueOnce(new Error("connection lost"));
        renderDialog();
        await playToAllIn();
        await reveal();
        expect(screen.getByRole("alert")).toHaveTextContent(de.errors.notSaved);
        expect(screen.getByText(de.expenses.estimateKeepOpen)).toBeInTheDocument();
        expect(text()).not.toContain("2.962");

        await act(async () => {
          fireEvent.click(button("Nochmal versuchen"));
        });
        expect(mocks.submit).toHaveBeenCalledTimes(2);
        expect(mocks.submit.mock.calls[1][0]).toEqual(mocks.submit.mock.calls[0][0]);
        playOut();
        expect(button("Übernehmen")).toBeEnabled();
      });
    });
  });

  describe("a Stechfrage", () => {
    /** Stage 0: Max and Lea are level on the paying line; stage 1 is theirs alone. */
    function tiedThenOpen() {
      const tied = bandTieRound();
      return makeRound(
        [
          tied.stages[0],
          makeStage(RATIO_QUESTION, ["max", "lea"], null, {
            index: 1,
            kind: "stechen",
            slots: 1,
          }),
        ],
        { order: uids },
      );
    }

    function decidedByStechen() {
      const tied = bandTieRound();
      const reveal = makeReveal(
        RATIO_QUESTION,
        2_962_000,
        [
          { uid: "lea", guess: 8_000_000, fate: "pays" },
          { uid: "max", guess: 2_900_000, fate: "safe" },
        ],
        { next: "decided" },
      );
      return makeRound(
        [
          tied.stages[0],
          makeStage(RATIO_QUESTION, ["max", "lea"], reveal, { index: 1, kind: "stechen" }),
        ],
        { status: "finished", loserUids: ["lea"], resolvedBy: "stechen", order: uids },
      );
    }

    beforeEach(() => {
      mocks.create.mockResolvedValue({
        ok: true,
        data: { roundId: "round1", stage: makeStage(DEGREES_QUESTION, uids, null) },
      });
      mocks.submit
        .mockReset()
        .mockResolvedValueOnce({ ok: true, data: { round: tiedThenOpen() } })
        .mockResolvedValueOnce({ ok: true, data: { round: decidedByStechen() } });
    });

    it("plays a second pass with the contenders only, in table order, and books the first payer", async () => {
      renderDialog();
      await clickStart();
      fireEvent.click(button("Los, der Reihe nach"));
      playSeat("lea", "90");
      playSeat("max", "111");
      playSeat("ben", "100");
      await reveal();
      expect(mocks.submit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          stageIndex: 0,
          guessesMilli: { lea: 90_000, max: 111_000, ben: 100_000 },
        }),
      );
      playOut();

      // The announcement names who plays on, and the new question is the Stechfrage.
      const status = screen
        .getAllByRole("status")
        .find((element) => element.textContent?.includes("Stechfrage für"));
      expect(status).toHaveTextContent("Gleichstand. Stechfrage für Max, Lea.");
      expect(screen.getByText(RATIO_QUESTION.text.de)).toBeInTheDocument();
      expect(screen.getByText("Stechfrage 1")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Übernehmen" })).toBeNull();

      fireEvent.click(button("Los, der Reihe nach"));
      // Ben (safe) sits this one out.
      expect(screen.getByText("Handy an Lea")).toBeInTheDocument();
      expect(screen.getAllByText("Tipp 1 von 2").length).toBeGreaterThan(0);
      playSeat("lea", "8000");
      expect(screen.getByText("Handy an Max")).toBeInTheDocument();
      playSeat("max", "2900");
      expect(screen.getByText("Alle haben getippt.")).toBeInTheDocument();

      await reveal();
      expect(mocks.submit).toHaveBeenLastCalledWith({
        groupId: "g1",
        roundId: "round1",
        stageIndex: 1,
        guessesMilli: { lea: 8_000_000, max: 2_900_000 },
      });
      playOut();
      fireEvent.click(button("Übernehmen"));
      expect(onResolve).toHaveBeenCalledWith(["lea"], uids, { estimateRoundId: "round1" });
    });
  });

  describe("closing", () => {
    it("closes at once when nothing is locked yet", async () => {
      renderDialog();
      await clickStart();
      fireEvent.click(button("Schließen"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByText(de.expenses.estimateDiscardTitle)).toBeNull();
      expect(mocks.cancel).not.toHaveBeenCalled();
    });

    it("asks before throwing away locked guesses, and „Weiterspielen“ keeps them", async () => {
      renderDialog();
      await clickStart();
      fireEvent.click(button("Los, der Reihe nach"));
      playSeat("lea");
      fireEvent.click(button("Schließen"));
      expect(onOpenChange).not.toHaveBeenCalled();
      const alert = screen.getByRole("alertdialog");
      expect(within(alert).getByText("Tipps verwerfen?")).toBeInTheDocument();

      fireEvent.click(within(alert).getByRole("button", { name: "Weiterspielen" }));
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(mocks.cancel).not.toHaveBeenCalled();
      expect(screen.getByText("Handy an Max")).toBeInTheDocument();
    });

    it("„Verwerfen“ cancels the round on the server and closes", async () => {
      renderDialog();
      await clickStart();
      fireEvent.click(button("Los, der Reihe nach"));
      playSeat("lea");
      fireEvent.click(button("Schließen"));
      await act(async () => {
        fireEvent.click(
          within(screen.getByRole("alertdialog")).getByRole("button", { name: "Verwerfen" }),
        );
      });
      expect(mocks.cancel).toHaveBeenCalledWith({ groupId: "g1", roundId: "round1" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("reports a failed cancel with console.error and still closes", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.cancel.mockResolvedValue({ ok: false, error: "forbidden" });
      renderDialog();
      await clickStart();
      fireEvent.click(button("Los, der Reihe nach"));
      playSeat("lea");
      fireEvent.click(button("Schließen"));
      await act(async () => {
        fireEvent.click(
          within(screen.getByRole("alertdialog")).getByRole("button", { name: "Verwerfen" }),
        );
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(error).toHaveBeenCalledWith("cancelEstimateRound failed:", "forbidden");
      error.mockRestore();
    });
  });

  it("speaks English", () => {
    render(
      <LocaleProvider initialLocale="en">
        <SplitEstimateDialog
          open
          onOpenChange={onOpenChange}
          members={members}
          memberUids={uids}
          groupId="g1"
          onResolve={onResolve}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole("switch", { name: "Include cheeky fun facts" })).toBeInTheDocument();
  });
});
