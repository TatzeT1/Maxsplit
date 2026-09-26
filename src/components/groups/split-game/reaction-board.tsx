"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import { randomInt } from "@/lib/games/random";
import {
  REACTION_MAX_DELAY_MS,
  REACTION_MIN_DELAY_MS,
  REACTION_SETTLE_MS,
  judgeReaction,
  type ReactionVerdict,
} from "@/lib/games/reaction-duel";
import { playBuzzerSound, playGoSound, playTickSound } from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

type Phase = "arming" | "steady" | "go" | "done";

const reactionTimeFormatter = new Intl.NumberFormat("de-DE");

function padResultText(
  t: ReturnType<typeof useT>,
  verdict: ReactionVerdict | "tooClose" | null,
  pad: 0 | 1,
  reactionMs: number | null,
): string | null {
  if (!verdict) return null;
  if (verdict === "tooClose") return t("expenses.reactionTooClose");
  if (verdict.kind === "win" && verdict.winner === pad) {
    return reactionMs !== null
      ? t("expenses.reactionTimeMs", { ms: reactionTimeFormatter.format(reactionMs) })
      : t("expenses.reactionFaster");
  }
  if (verdict.kind === "win" && verdict.reason === "falseStart") {
    return t("expenses.reactionFalseStart");
  }
  return t("expenses.reactionFaster");
}

/**
 * One reaction match: both players tap their half when ready, a "Los!"
 * signal appears after a random delay, and the faster valid tap wins. A tap
 * before the signal is an instant false start. Remounted fresh for every new
 * match and every "too close" replay.
 */
export function ReactionBoard({ players, members, locked, onWin, onDraw }: DuelBoardProps) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("arming");
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const [taps, setTaps] = useState<[number | null, number | null]>([null, null]);
  const [signalAt, setSignalAt] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<ReactionVerdict | "tooClose" | null>(null);
  const phaseRef = useRef<Phase>("arming");
  // Mirrors of the state above, kept in sync *synchronously* on every write —
  // two pads can each receive a pointer event in the same tick (two fingers,
  // one on each half), and only a ref read-then-write right where the event
  // lands is guaranteed to see the other pad's just-registered tap/ready
  // flag before this one commits. State alone would let both handlers read
  // the same pre-update snapshot and silently drop one another's result.
  const readyRef = useRef<[boolean, boolean]>([false, false]);
  const signalAtRef = useRef<number | null>(null);
  const tapsRef = useRef<[number | null, number | null]>([null, null]);
  const finishedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [colorA, colorB] = duelPalettes(
    members[players[0]].displayName,
    members[players[1]].displayName,
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    // Same array for this component's whole lifetime — only ever mutated via
    // `.push`, never reassigned — so capturing it here still sees every
    // timer scheduled right up to unmount.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function judgeNow() {
    const result = judgeReaction({ signalAt: signalAtRef.current, taps: tapsRef.current });
    if (!result) return;
    finishedRef.current = true;
    setPhase("done");
    setVerdict(result.kind === "tooClose" ? "tooClose" : result);
    if (result.kind === "tooClose") onDraw();
    else onWin(players[result.winner]);
  }

  function armPad(pad: 0 | 1) {
    if (locked || finishedRef.current || phaseRef.current !== "arming" || readyRef.current[pad])
      return;
    playTickSound();
    const nextReady: [boolean, boolean] = [...readyRef.current];
    nextReady[pad] = true;
    readyRef.current = nextReady;
    setReady(nextReady);

    if (nextReady[0] && nextReady[1]) {
      phaseRef.current = "steady";
      setPhase("steady");
      const delay = randomInt(REACTION_MIN_DELAY_MS, REACTION_MAX_DELAY_MS);
      const timer = setTimeout(() => {
        const now = performance.now();
        signalAtRef.current = now;
        setSignalAt(now);
        phaseRef.current = "go";
        setPhase("go");
        playGoSound();
      }, delay);
      timersRef.current.push(timer);
    }
  }

  function tapPad(pad: 0 | 1, now: number) {
    if (locked || finishedRef.current) return;
    if (phaseRef.current === "arming" || phaseRef.current === "done") return;
    if (tapsRef.current[pad] !== null) return;
    if (phaseRef.current === "steady") playBuzzerSound();
    const nextTaps: [number | null, number | null] =
      pad === 0 ? [now, tapsRef.current[1]] : [tapsRef.current[0], now];
    tapsRef.current = nextTaps;
    setTaps(nextTaps);

    const settleTimer = setTimeout(judgeNow, REACTION_SETTLE_MS);
    timersRef.current.push(settleTimer);
  }

  function handlePointerDown(pad: 0 | 1) {
    return (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (phaseRef.current === "arming") {
        armPad(pad);
        return;
      }
      // `event.timeStamp` shares a clock with `performance.now()` in every
      // modern engine; the fallback only guards against an unexpected
      // epoch-based value, which would otherwise silently corrupt the timing
      // comparison against `signalAtRef` (also a `performance.now()` value).
      // Resolved here, directly in the event handler, rather than inside
      // `tapPad` — the impurity has to stay textually inside a handler.
      const now = event.timeStamp > 1e12 ? performance.now() : event.timeStamp;
      tapPad(pad, now);
    };
  }

  function padLabel(pad: 0 | 1): string {
    if (phase === "arming")
      return ready[pad] ? t("expenses.reactionReady") : t("expenses.reactionTapWhenReady");
    if (phase === "steady") return t("expenses.reactionSteady");
    if (phase === "go" && taps[pad] === null) return t("expenses.reactionGo");
    const reactionMs =
      signalAt !== null && taps[pad] !== null
        ? Math.max(0, Math.round((taps[pad] as number) - signalAt))
        : null;
    return padResultText(t, verdict, pad, reactionMs) ?? t("expenses.reactionSteady");
  }

  const bothReady = ready[0] && ready[1];
  const showGo = phase === "go";

  return (
    <div className="flex touch-none flex-col gap-1.5 select-none [-webkit-touch-callout:none]">
      {!bothReady && phase === "arming" && (
        <p className="text-muted-foreground text-center text-xs">
          {!ready[0]
            ? t("expenses.reactionWaitingFor", { name: members[players[0]].displayName })
            : t("expenses.reactionWaitingFor", { name: members[players[1]].displayName })}
        </p>
      )}
      <div className="flex h-[min(56dvh,420px)] flex-col gap-1.5 overflow-hidden rounded-xl">
        {([1, 0] as const).map((pad) => (
          <button
            key={pad}
            type="button"
            onPointerDown={handlePointerDown(pad)}
            disabled={locked || phase === "done"}
            className={cn(
              "relative flex flex-1 touch-manipulation items-center justify-center rounded-xl text-lg font-semibold transition-colors duration-(--duration-fast)",
              pad === 1 && "rotate-180",
              showGo ? "text-white" : "text-foreground",
            )}
            style={{
              backgroundColor: showGo
                ? pad === 0
                  ? colorA
                  : colorB
                : `color-mix(in oklch, ${pad === 0 ? colorA : colorB} 18%, var(--muted))`,
            }}
          >
            {padLabel(pad)}
          </button>
        ))}
      </div>
    </div>
  );
}
