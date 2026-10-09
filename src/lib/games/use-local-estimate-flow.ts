"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResult } from "@/lib/actions/groups";
import { callAction } from "@/lib/call-action";
import { isEstimateDecided } from "@/lib/games/estimate-input";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useOnline } from "@/lib/use-online";
import type { EstimateRound, EstimateStage } from "@/lib/types";

/**
 * The state machine of ONE-PHONE estimate rounds (spec G.3):
 *
 *   setup -> intro -> handover(0) -> guess(0) -> handover(1) -> ... -> allin
 *         -> (submit) -> reveal -> intro (a Stechfrage, contenders only) | done
 *
 * Held in memory only. The hidden guesses live in a ref, never in state (a render
 * can never print one), never in `localStorage`, the URL or Firestore: the server
 * only ever sees them in ONE call per stage, the final submit. Losing the
 * connection mid-round therefore loses nothing; only starting and the final
 * submit need the network, and a failed submit leaves the table on `allin` with
 * its guesses intact — retrying is safe because `submitLocalEstimateGuesses` is
 * idempotent for an identical payload (spec E.7).
 *
 * The three Server Actions are INJECTED (`actions`): the hook stays free of the
 * `"use server"` module and the dialog passes the real ones. Every call goes
 * through `callAction`, so a thrown call is `{ ok: false, error: "network" }`,
 * and `busy` is reset in every branch — never a spinner that never stops.
 */

export type LocalEstimateStep =
  "setup" | "intro" | "handover" | "guess" | "allin" | "reveal" | "done";

export interface LocalEstimateActions {
  create: (input: {
    groupId: string;
    poolUids: string[];
    targetLoserCount: number;
    includeFun: boolean;
  }) => Promise<ActionResult<{ roundId: string; stage: EstimateStage }>>;
  submit: (input: {
    groupId: string;
    roundId: string;
    stageIndex: number;
    guessesMilli: Record<string, number>;
  }) => Promise<ActionResult<{ round: EstimateRound }>>;
  cancel: (input: { groupId: string; roundId: string }) => Promise<ActionResult<null>>;
}

export interface UseLocalEstimateFlowOptions {
  groupId: string;
  /** The table's physical order = the hand-over order. Read when a round starts. */
  poolUids: readonly string[];
  targetLoserCount: number;
  includeFun: boolean;
  actions: LocalEstimateActions;
  /** Called after every successful round creation (`useGameRound().startRound`: the "n. Versuch" count). */
  onRoundStarted?: () => void;
}

interface FlowState {
  step: LocalEstimateStep;
  roundId: string | null;
  /** The stage being played (guessing) — public question only. */
  stage: EstimateStage | null;
  /** The latest round the server returned: set by the submit, holds the reveal. */
  round: EstimateRound | null;
  /** Who guesses in this stage, in hand-over order. */
  seats: string[];
  seatIndex: number;
  lockedCount: number;
  busy: boolean;
  /** An `ActionResult.error` code; map it with `localEstimateErrorKey`. */
  errorCode: string | null;
}

const INITIAL: FlowState = {
  step: "setup",
  roundId: null,
  stage: null,
  round: null,
  seats: [],
  seatIndex: 0,
  lockedCount: 0,
  busy: false,
  errorCode: null,
};

/**
 * The dictionary key for a failed action's error code: the start errors of G.2,
 * the guess range errors, `network` -> "not saved", and a generic fallback per
 * context. Shared by the dialog and the online page.
 */
export function localEstimateErrorKey(
  code: string,
  context: "start" | "submit" = "submit",
): TranslationKey {
  switch (code) {
    case "round-running":
      return "expenses.estimateRoundRunning";
    case "rate-limited":
      return "expenses.estimateRateLimited";
    case "bank-empty":
      return "expenses.estimateBankEmpty";
    case "invalid-pool":
      return "expenses.estimatePlaceOnlinePlaceholderHint";
    case "network":
      return "errors.notSaved";
    case "guess-zero":
      return "expenses.estimateGuessZero";
    case "guess-not-whole":
      return "expenses.estimateGuessNotWhole";
    case "guess-below-min":
      return "expenses.estimateGuessBelowMin";
    case "guess-above-max":
      return "expenses.estimateGuessAboveMax";
    case "stale-stage":
      return "expenses.estimateStaleStage";
    case "stage-closed":
      return "expenses.estimateStageClosed";
    default:
      return context === "start" ? "expenses.estimateStartError" : "expenses.estimateActionError";
  }
}

export function useLocalEstimateFlow(options: UseLocalEstimateFlowOptions) {
  const { groupId, targetLoserCount, includeFun, actions, onRoundStarted } = options;
  const online = useOnline();
  const [state, setState] = useState<FlowState>(INITIAL);

  /** The locked guesses of the current stage. A ref on purpose: never rendered, never persisted. */
  const guessesRef = useRef<Record<string, number>>({});
  /** Synchronous double-tap guard (state would only update next render). */
  const busyRef = useRef(false);
  /** Bumped by every reset, so an answer that arrives after the dialog was closed is dropped. */
  const generationRef = useRef(0);

  const patch = useCallback((next: Partial<FlowState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  /** Back to `setup`, forgetting everything. Does not call the server. */
  const reset = useCallback(() => {
    generationRef.current += 1;
    guessesRef.current = {};
    busyRef.current = false;
    setState(INITIAL);
  }, []);

  /** setup -> intro: draws the question on the server. */
  const start = useCallback(async () => {
    if (busyRef.current || !online || state.step !== "setup") return;
    const poolUids = [...options.poolUids];
    const generation = generationRef.current;
    busyRef.current = true;
    patch({ busy: true, errorCode: null });
    try {
      const result = await callAction(() =>
        actions.create({ groupId, poolUids, targetLoserCount, includeFun }),
      );
      if (generation !== generationRef.current) return;
      if (!result.ok) {
        patch({ errorCode: result.error });
        return;
      }
      guessesRef.current = {};
      onRoundStarted?.();
      setState({
        ...INITIAL,
        step: "intro",
        roundId: result.data.roundId,
        stage: result.data.stage,
        seats: poolUids.filter((uid) => result.data.stage.contenders.includes(uid)),
      });
    } finally {
      if (generation === generationRef.current) {
        busyRef.current = false;
        patch({ busy: false });
      }
    }
  }, [
    actions,
    groupId,
    includeFun,
    online,
    onRoundStarted,
    options.poolUids,
    patch,
    state.step,
    targetLoserCount,
  ]);

  /** intro -> handover(seat 0). */
  const begin = useCallback(() => {
    setState((current) =>
      current.step === "intro" ? { ...current, step: "handover", seatIndex: 0 } : current,
    );
  }, []);

  /** handover(i) -> guess(i): "Ich bin {name}". */
  const ready = useCallback(() => {
    setState((current) => (current.step === "handover" ? { ...current, step: "guess" } : current));
  }, []);

  /** guess(i) -> handover(i + 1), or `allin` after the last seat. The value goes into the ref, nowhere else. */
  const lock = useCallback(
    (milli: number) => {
      if (state.step !== "guess") return;
      const uid = state.seats[state.seatIndex];
      if (uid === undefined) return;
      guessesRef.current[uid] = milli;
      const nextIndex = state.seatIndex + 1;
      const done = nextIndex >= state.seats.length;
      setState({
        ...state,
        step: done ? "allin" : "handover",
        seatIndex: done ? state.seatIndex : nextIndex,
        lockedCount: state.lockedCount + 1,
        errorCode: null,
      });
    },
    [state],
  );

  /** allin -> reveal: the one call that hands the guesses to the server. Safe to repeat after a failure. */
  const submit = useCallback(async () => {
    if (busyRef.current || !online || state.step !== "allin" || !state.roundId || !state.stage) {
      return;
    }
    const { roundId, stage } = state;
    const generation = generationRef.current;
    busyRef.current = true;
    patch({ busy: true, errorCode: null });
    try {
      const result = await callAction(() =>
        actions.submit({
          groupId,
          roundId,
          stageIndex: stage.index,
          guessesMilli: { ...guessesRef.current },
        }),
      );
      if (generation !== generationRef.current) return;
      if (!result.ok) {
        patch({ errorCode: result.error });
        return;
      }
      if (!result.data.round.stages[stage.index]?.reveal) {
        // The server said ok but sent no reveal: a failure, never a silent stall.
        patch({ errorCode: "bad-response" });
        return;
      }
      // The guesses are on the server now (revealed); nothing on this device needs them any more.
      guessesRef.current = {};
      patch({ step: "reveal", round: result.data.round, errorCode: null });
    } finally {
      if (generation === generationRef.current) {
        busyRef.current = false;
        patch({ busy: false });
      }
    }
  }, [actions, groupId, online, patch, state]);

  /**
   * reveal -> intro (the Stechfrage the reveal opened: only the contested play,
   * in table order) or -> done. Call it when the reveal has played out.
   */
  const continueFromReveal = useCallback(() => {
    if (state.step !== "reveal" || !state.round) return;
    const { round } = state;
    const last = round.stages[round.stages.length - 1];
    if (isEstimateDecided(round)) {
      setState({ ...state, step: "done" });
      return;
    }
    if (last && last.status === "guessing") {
      guessesRef.current = {};
      setState({
        ...state,
        step: "intro",
        stage: last,
        seats: round.order.filter((uid) => last.contenders.includes(uid)),
        seatIndex: 0,
        lockedCount: 0,
        errorCode: null,
      });
    }
  }, [state]);

  /** Throws the round away: asks the server to cancel it (a failure is reported, never blocks) and goes back to `setup`. */
  const discard = useCallback(async () => {
    const { roundId, round } = state;
    const open = roundId !== null && !(round && isEstimateDecided(round));
    reset();
    if (!open || roundId === null) return;
    const result = await callAction(() => actions.cancel({ groupId, roundId }));
    if (!result.ok) console.error("cancelEstimateRound failed:", result.error);
  }, [actions, groupId, reset, state]);

  const seatUid = state.seats[state.seatIndex] ?? null;
  const decided = state.round !== null && isEstimateDecided(state.round);

  return {
    step: state.step,
    online,
    busy: state.busy,
    errorCode: state.errorCode,
    /** The stage being played (public question only). */
    stage: state.stage,
    roundId: state.roundId,
    /** The latest server round: holds the reveal once `step` is `reveal` / `done`. */
    round: state.round,
    /** The stage whose reveal is on screen (`reveal` / `done`). */
    revealStageIndex: state.round ? state.round.stages.findLastIndex((s) => s.reveal !== null) : -1,
    seats: state.seats,
    seatUid,
    /** 1-based, for "Tipp 2 von 3" and `EstimateHandOver`'s `position`. */
    seatPosition: state.seatIndex + 1,
    seatCount: state.seats.length,
    lockedCount: state.lockedCount,
    /** Closing now would lose guesses that are locked but not yet scored. */
    needsDiscardConfirm:
      (state.step === "handover" || state.step === "guess" || state.step === "allin") &&
      state.lockedCount >= 1,
    /** What `onResolve` takes once `step` is `done`. */
    resolution:
      state.step === "done" && decided && state.round?.loserUids && state.roundId
        ? {
            loserUids: state.round.loserUids,
            playerUids: state.round.order,
            estimateRoundId: state.roundId,
          }
        : null,
    start,
    begin,
    ready,
    lock,
    submit,
    continueFromReveal,
    discard,
    /** "Neu starten" and closing the dialog: back to `setup` without a server call. */
    reset,
  };
}
