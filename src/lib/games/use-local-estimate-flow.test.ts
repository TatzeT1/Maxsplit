import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EstimateRound, EstimateStage } from "@/lib/types";
import {
  localEstimateErrorKey,
  useLocalEstimateFlow,
  type LocalEstimateActions,
} from "./use-local-estimate-flow";
import {
  DEGREES_QUESTION,
  RATIO_QUESTION,
  bandTieRound,
  decidedRound,
  makeRound,
  makeStage,
} from "@/components/groups/split-game/estimate/estimate-test-data";

const POOL = ["lea", "max", "ben"];

function guessingStage(): EstimateStage {
  return makeStage(RATIO_QUESTION, POOL, null);
}

function makeActions(overrides: Partial<LocalEstimateActions> = {}) {
  const actions = {
    create: vi.fn(async () => ({
      ok: true as const,
      data: { roundId: "round1", stage: guessingStage() },
    })),
    submit: vi.fn(async () => ({ ok: true as const, data: { round: decidedRound() } })),
    cancel: vi.fn(async () => ({ ok: true as const, data: null })),
    ...overrides,
  } satisfies LocalEstimateActions;
  return actions;
}

function setup(
  actions = makeActions(),
  extra: { onRoundStarted?: () => void; poolUids?: string[] } = {},
) {
  const hook = renderHook(
    (props: { poolUids: string[] }) =>
      useLocalEstimateFlow({
        groupId: "g1",
        poolUids: props.poolUids,
        targetLoserCount: 1,
        includeFun: false,
        actions,
        onRoundStarted: extra.onRoundStarted,
      }),
    { initialProps: { poolUids: extra.poolUids ?? POOL } },
  );
  return { actions, ...hook };
}

async function started(actions = makeActions()) {
  const view = setup(actions);
  await act(async () => {
    await view.result.current.start();
  });
  return view;
}

/** intro -> through every seat's lock with the given guesses. */
function playSeats(view: ReturnType<typeof setup>, guesses: number[]) {
  act(() => view.result.current.begin());
  guesses.forEach((milli) => {
    act(() => view.result.current.ready());
    act(() => view.result.current.lock(milli));
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

describe("useLocalEstimateFlow", () => {
  beforeEach(() => {
    setOnline(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("starting", () => {
    it("starts in setup", () => {
      const { result } = setup();
      expect(result.current.step).toBe("setup");
      expect(result.current.stage).toBeNull();
      expect(result.current.needsDiscardConfirm).toBe(false);
    });

    it("creates the round with the table, count and fun flag, counts the attempt and goes to the intro", async () => {
      const onRoundStarted = vi.fn();
      const actions = makeActions();
      const view = setup(actions, { onRoundStarted });
      await act(async () => {
        await view.result.current.start();
      });
      expect(actions.create).toHaveBeenCalledWith({
        groupId: "g1",
        poolUids: POOL,
        targetLoserCount: 1,
        includeFun: false,
      });
      expect(onRoundStarted).toHaveBeenCalledTimes(1);
      expect(view.result.current.step).toBe("intro");
      expect(view.result.current.stage?.question.id).toBe(RATIO_QUESTION.id);
      expect(view.result.current.seats).toEqual(POOL);
      expect(view.result.current.busy).toBe(false);
    });

    it("stays in setup with the error code when the server refuses, and counts no attempt", async () => {
      const onRoundStarted = vi.fn();
      const actions = makeActions({
        create: vi.fn(async () => ({ ok: false as const, error: "bank-empty" })),
      });
      const view = setup(actions, { onRoundStarted });
      await act(async () => {
        await view.result.current.start();
      });
      expect(view.result.current.step).toBe("setup");
      expect(view.result.current.errorCode).toBe("bank-empty");
      expect(view.result.current.busy).toBe(false);
      expect(onRoundStarted).not.toHaveBeenCalled();
    });

    it("turns a thrown call into 'network' and releases the spinner", async () => {
      const actions = makeActions({
        create: vi.fn(async () => {
          throw new Error("offline");
        }),
      });
      const view = setup(actions);
      await act(async () => {
        await view.result.current.start();
      });
      expect(view.result.current.errorCode).toBe("network");
      expect(view.result.current.busy).toBe(false);
      expect(view.result.current.step).toBe("setup");
    });

    it("does not call the server while offline", async () => {
      setOnline(false);
      const view = setup();
      expect(view.result.current.online).toBe(false);
      await act(async () => {
        await view.result.current.start();
      });
      expect(view.actions.create).not.toHaveBeenCalled();
      expect(view.result.current.step).toBe("setup");
    });

    it("ignores a second tap while the first call is in flight", async () => {
      let release: (value: Awaited<ReturnType<LocalEstimateActions["create"]>>) => void = () => {};
      const actions = makeActions({
        create: vi.fn(
          () =>
            new Promise<Awaited<ReturnType<LocalEstimateActions["create"]>>>((resolve) => {
              release = resolve;
            }),
        ),
      });
      const view = setup(actions);
      let first: Promise<void> = Promise.resolve();
      await act(async () => {
        first = view.result.current.start();
        void view.result.current.start();
      });
      expect(actions.create).toHaveBeenCalledTimes(1);
      expect(view.result.current.busy).toBe(true);
      await act(async () => {
        release({ ok: true, data: { roundId: "round1", stage: guessingStage() } });
        await first;
      });
      expect(view.result.current.step).toBe("intro");
    });

    it("drops an answer that arrives after the dialog was reset", async () => {
      let release: (value: Awaited<ReturnType<LocalEstimateActions["create"]>>) => void = () => {};
      const actions = makeActions({
        create: vi.fn(
          () =>
            new Promise<Awaited<ReturnType<LocalEstimateActions["create"]>>>((resolve) => {
              release = resolve;
            }),
        ),
      });
      const view = setup(actions);
      let pending: Promise<void> = Promise.resolve();
      await act(async () => {
        pending = view.result.current.start();
      });
      act(() => view.result.current.reset());
      await act(async () => {
        release({ ok: true, data: { roundId: "round1", stage: guessingStage() } });
        await pending;
      });
      expect(view.result.current.step).toBe("setup");
      expect(view.result.current.busy).toBe(false);
    });
  });

  describe("going round the table", () => {
    it("walks intro -> handover -> guess per seat -> allin", async () => {
      const view = await started();
      expect(view.result.current.step).toBe("intro");

      act(() => view.result.current.begin());
      expect(view.result.current.step).toBe("handover");
      expect(view.result.current.seatUid).toBe("lea");
      expect(view.result.current.seatPosition).toBe(1);
      expect(view.result.current.seatCount).toBe(3);

      act(() => view.result.current.ready());
      expect(view.result.current.step).toBe("guess");
      act(() => view.result.current.lock(2_900_000));
      expect(view.result.current.step).toBe("handover");
      expect(view.result.current.seatUid).toBe("max");
      expect(view.result.current.seatPosition).toBe(2);
      expect(view.result.current.lockedCount).toBe(1);

      act(() => view.result.current.ready());
      act(() => view.result.current.lock(1_200_000));
      act(() => view.result.current.ready());
      act(() => view.result.current.lock(8_000_000));
      expect(view.result.current.step).toBe("allin");
      expect(view.result.current.lockedCount).toBe(3);
    });

    it("cannot skip a hand-over, lock without being at the guess screen, or double-lock a seat", async () => {
      const view = await started();
      act(() => view.result.current.ready());
      expect(view.result.current.step).toBe("intro");
      act(() => view.result.current.lock(5));
      expect(view.result.current.lockedCount).toBe(0);

      act(() => view.result.current.begin());
      act(() => view.result.current.lock(5));
      expect(view.result.current.step).toBe("handover");
      expect(view.result.current.lockedCount).toBe(0);

      act(() => view.result.current.ready());
      act(() => view.result.current.lock(5));
      act(() => view.result.current.lock(7));
      expect(view.result.current.lockedCount).toBe(1);
      expect(view.result.current.seatUid).toBe("max");
    });

    it("never exposes a locked guess: not in the returned state, not in any serialisation of it", async () => {
      const view = await started();
      playSeats(view, [2_900_000, 1_234_567, 8_000_000]);
      const { start, begin, ready, lock, submit, continueFromReveal, discard, reset, ...state } =
        view.result.current;
      void [start, begin, ready, lock, submit, continueFromReveal, discard, reset];
      const text = JSON.stringify(state);
      for (const milli of ["2900000", "1234567", "8000000", "1234", "2900"]) {
        expect(text).not.toContain(milli);
      }
    });

    it("asks before throwing away locked guesses, but not before the first lock", async () => {
      const view = await started();
      act(() => view.result.current.begin());
      expect(view.result.current.needsDiscardConfirm).toBe(false);
      act(() => view.result.current.ready());
      expect(view.result.current.needsDiscardConfirm).toBe(false);
      act(() => view.result.current.lock(5_000));
      expect(view.result.current.step).toBe("handover");
      expect(view.result.current.needsDiscardConfirm).toBe(true);
      act(() => view.result.current.ready());
      expect(view.result.current.needsDiscardConfirm).toBe(true);
    });
  });

  describe("submitting", () => {
    it("hands every seat's guess to the server in ONE call and reveals", async () => {
      const view = await started();
      playSeats(view, [2_900_000, 1_200_000, 8_000_000]);
      expect(view.actions.submit).not.toHaveBeenCalled();
      await act(async () => {
        await view.result.current.submit();
      });
      expect(view.actions.submit).toHaveBeenCalledTimes(1);
      expect(view.actions.submit).toHaveBeenCalledWith({
        groupId: "g1",
        roundId: "round1",
        stageIndex: 0,
        guessesMilli: { lea: 2_900_000, max: 1_200_000, ben: 8_000_000 },
      });
      expect(view.result.current.step).toBe("reveal");
      expect(view.result.current.round?.loserUids).toEqual(["ben"]);
      expect(view.result.current.revealStageIndex).toBe(0);
      expect(view.result.current.needsDiscardConfirm).toBe(false);
    });

    it("stays on allin with the error after a failure, keeps the guesses and retries the same payload", async () => {
      const submit = vi
        .fn<LocalEstimateActions["submit"]>()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce({ ok: true, data: { round: decidedRound() } });
      const view = await started(makeActions({ submit }));
      playSeats(view, [2_900_000, 1_200_000, 8_000_000]);

      await act(async () => {
        await view.result.current.submit();
      });
      expect(view.result.current.step).toBe("allin");
      expect(view.result.current.errorCode).toBe("network");
      expect(view.result.current.busy).toBe(false);
      expect(view.result.current.lockedCount).toBe(3);

      await act(async () => {
        await view.result.current.submit();
      });
      expect(submit).toHaveBeenCalledTimes(2);
      expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);
      expect(view.result.current.step).toBe("reveal");
      expect(view.result.current.errorCode).toBeNull();
    });

    it("reports a server answer that carries no reveal instead of stalling", async () => {
      const stale = makeRound([guessingStage()]);
      const view = await started(
        makeActions({ submit: vi.fn(async () => ({ ok: true as const, data: { round: stale } })) }),
      );
      playSeats(
        view,
        [1, 2, 3].map((n) => n * 1_000_000),
      );
      await act(async () => {
        await view.result.current.submit();
      });
      expect(view.result.current.step).toBe("allin");
      expect(view.result.current.errorCode).toBe("bad-response");
    });

    it("does not submit while offline, and does once the connection is back", async () => {
      const view = await started();
      playSeats(view, [2_900_000, 1_200_000, 8_000_000]);
      setOnline(false);
      await act(async () => {
        await view.result.current.submit();
      });
      expect(view.actions.submit).not.toHaveBeenCalled();
      expect(view.result.current.step).toBe("allin");
      expect(view.result.current.online).toBe(false);

      setOnline(true);
      await act(async () => {
        await view.result.current.submit();
      });
      expect(view.actions.submit).toHaveBeenCalledTimes(1);
      expect(view.result.current.step).toBe("reveal");
    });

    it("ignores a double tap", async () => {
      let release: (value: Awaited<ReturnType<LocalEstimateActions["submit"]>>) => void = () => {};
      const submit = vi.fn<LocalEstimateActions["submit"]>(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const view = await started(makeActions({ submit }));
      playSeats(view, [2_900_000, 1_200_000, 8_000_000]);
      let first: Promise<void> = Promise.resolve();
      await act(async () => {
        first = view.result.current.submit();
        void view.result.current.submit();
      });
      expect(submit).toHaveBeenCalledTimes(1);
      await act(async () => {
        release({ ok: true, data: { round: decidedRound() } });
        await first;
      });
    });
  });

  describe("after the reveal", () => {
    async function revealed(round: EstimateRound) {
      const view = await started(
        makeActions({ submit: vi.fn(async () => ({ ok: true as const, data: { round } })) }),
      );
      playSeats(view, [2_900_000, 1_200_000, 8_000_000]);
      await act(async () => {
        await view.result.current.submit();
      });
      return view;
    }

    it("finishes at 'done' when the round is decided, with what onResolve takes", async () => {
      const view = await revealed(decidedRound());
      expect(view.result.current.resolution).toBeNull();
      act(() => view.result.current.continueFromReveal());
      expect(view.result.current.step).toBe("done");
      expect(view.result.current.resolution).toEqual({
        loserUids: ["ben"],
        playerUids: ["lea", "max", "ben"],
        estimateRoundId: "round1",
      });
    });

    it("opens the Stechfrage for the contested only, in table order, with fresh guesses", async () => {
      const tie = bandTieRound();
      const next = makeStage(DEGREES_QUESTION, ["lea", "max"], null, { index: 1, kind: "stechen" });
      const round = { ...tie, stages: [tie.stages[0], next], order: ["lea", "max", "ben"] };
      const submit = vi
        .fn<LocalEstimateActions["submit"]>()
        .mockResolvedValueOnce({ ok: true, data: { round } })
        .mockResolvedValueOnce({ ok: true, data: { round: decidedRound() } });
      const view = await started(makeActions({ submit }));
      playSeats(view, [90_000, 111_000, 100_000]);
      await act(async () => {
        await view.result.current.submit();
      });
      expect(view.result.current.step).toBe("reveal");

      act(() => view.result.current.continueFromReveal());
      expect(view.result.current.step).toBe("intro");
      expect(view.result.current.stage?.index).toBe(1);
      expect(view.result.current.stage?.question.id).toBe(DEGREES_QUESTION.id);
      expect(view.result.current.seats).toEqual(["lea", "max"]);
      expect(view.result.current.lockedCount).toBe(0);
      expect(view.result.current.resolution).toBeNull();

      playSeats(view, [480_000, 650_000]);
      await act(async () => {
        await view.result.current.submit();
      });
      // Only the Stechfrage's two seats, and none of the first stage's guesses.
      expect(submit.mock.calls[1][0]).toEqual({
        groupId: "g1",
        roundId: "round1",
        stageIndex: 1,
        guessesMilli: { lea: 480_000, max: 650_000 },
      });
    });

    it("ignores continueFromReveal outside the reveal", async () => {
      const view = await started();
      act(() => view.result.current.continueFromReveal());
      expect(view.result.current.step).toBe("intro");
    });

    it("'Neu starten' goes back to setup and a new start counts a new attempt", async () => {
      const onRoundStarted = vi.fn();
      const view = setup(makeActions(), { onRoundStarted });
      await act(async () => {
        await view.result.current.start();
      });
      playSeats(view, [2_900_000, 1_200_000, 8_000_000]);
      await act(async () => {
        await view.result.current.submit();
      });
      act(() => view.result.current.continueFromReveal());
      act(() => view.result.current.reset());
      expect(view.result.current.step).toBe("setup");
      expect(view.result.current.round).toBeNull();
      await act(async () => {
        await view.result.current.start();
      });
      expect(onRoundStarted).toHaveBeenCalledTimes(2);
      expect(view.result.current.step).toBe("intro");
    });
  });

  describe("discarding", () => {
    it("cancels the open round on the server and returns to setup", async () => {
      const view = await started();
      playSeats(view, [1_000, 2_000]);
      await act(async () => {
        await view.result.current.discard();
      });
      expect(view.actions.cancel).toHaveBeenCalledWith({ groupId: "g1", roundId: "round1" });
      expect(view.result.current.step).toBe("setup");
      expect(view.result.current.lockedCount).toBe(0);
    });

    it("reports a failed cancel on the console and never blocks the close", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const view = await started(
        makeActions({ cancel: vi.fn(async () => ({ ok: false as const, error: "not-creator" })) }),
      );
      await act(async () => {
        await view.result.current.discard();
      });
      expect(error).toHaveBeenCalled();
      expect(view.result.current.step).toBe("setup");
    });

    it("reports a thrown cancel too", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const view = await started(
        makeActions({
          cancel: vi.fn(async () => {
            throw new Error("offline");
          }),
        }),
      );
      await act(async () => {
        await view.result.current.discard();
      });
      expect(error).toHaveBeenCalledWith("cancelEstimateRound failed:", "network");
      expect(view.result.current.step).toBe("setup");
    });

    it("has nothing to cancel before a round exists or after it is decided", async () => {
      const fresh = setup();
      await act(async () => {
        await fresh.result.current.discard();
      });
      expect(fresh.actions.cancel).not.toHaveBeenCalled();

      const view = await started();
      playSeats(view, [2_900_000, 1_200_000, 8_000_000]);
      await act(async () => {
        await view.result.current.submit();
      });
      await act(async () => {
        await view.result.current.discard();
      });
      expect(view.actions.cancel).not.toHaveBeenCalled();
    });
  });
});

describe("localEstimateErrorKey", () => {
  it("maps the start errors of the setup step", () => {
    expect(localEstimateErrorKey("round-running", "start")).toBe("expenses.estimateRoundRunning");
    expect(localEstimateErrorKey("rate-limited", "start")).toBe("expenses.estimateRateLimited");
    expect(localEstimateErrorKey("bank-empty", "start")).toBe("expenses.estimateBankEmpty");
    expect(localEstimateErrorKey("invalid-pool", "start")).toBe(
      "expenses.estimatePlaceOnlinePlaceholderHint",
    );
    expect(localEstimateErrorKey("network", "start")).toBe("errors.notSaved");
  });

  it("falls back per context", () => {
    expect(localEstimateErrorKey("whatever", "start")).toBe("expenses.estimateStartError");
    expect(localEstimateErrorKey("whatever", "submit")).toBe("expenses.estimateActionError");
    expect(localEstimateErrorKey("whatever")).toBe("expenses.estimateActionError");
  });

  it("maps the guess range errors and the stage errors", () => {
    expect(localEstimateErrorKey("guess-zero")).toBe("expenses.estimateGuessZero");
    expect(localEstimateErrorKey("guess-not-whole")).toBe("expenses.estimateGuessNotWhole");
    expect(localEstimateErrorKey("guess-below-min")).toBe("expenses.estimateGuessBelowMin");
    expect(localEstimateErrorKey("guess-above-max")).toBe("expenses.estimateGuessAboveMax");
    expect(localEstimateErrorKey("stale-stage")).toBe("expenses.estimateStaleStage");
    expect(localEstimateErrorKey("stage-closed")).toBe("expenses.estimateStageClosed");
  });
});
