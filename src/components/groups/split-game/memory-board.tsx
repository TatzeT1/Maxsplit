"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  MEMORY_PAIR_COUNT,
  buildMemoryDeck,
  memoryOutcome,
  type MemoryCard,
} from "@/lib/games/memory-duel";
import { playGiggleSound, playMissSound, playTickSound } from "@/lib/sound/game-sounds";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import { cn } from "@/lib/utils";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

/** How long a non-matching pair stays face up before flipping back and passing the turn. */
const MISMATCH_HOLD_MS = 900;

/**
 * One memory match: 18 cards (9 pairs), turns pass on a mismatch and repeat
 * on a match. Nine is odd, so the match can never end in a tie — `onDraw` is
 * accepted for shape parity with the other boards but never actually called.
 */
export function MemoryBoard({ players, members, locked, onWin }: DuelBoardProps) {
  const t = useT();
  const [cards, setCards] = useState<MemoryCard[]>(() => buildMemoryDeck());
  const [openIndices, setOpenIndices] = useState<number[]>([]);
  const [turn, setTurn] = useState<0 | 1>(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const openRef = useRef<number[]>([]);
  const mismatchLockRef = useRef(false);
  const finishedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [colorA, colorB] = duelPalettes(
    members[players[0]].displayName,
    members[players[1]].displayName,
  );

  useEffect(() => {
    // `timers` and `timersRef.current` are the same array for this
    // component's whole lifetime (only ever mutated via `.push`, never
    // reassigned), so capturing it here still sees every timer scheduled
    // right up to unmount.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function flipCard(index: number) {
    if (locked || finishedRef.current || mismatchLockRef.current) return;
    if (openRef.current.includes(index) || openRef.current.length >= 2) return;
    if (cards[index].claimedBy !== null) return;

    playTickSound();
    const nextOpen = [...openRef.current, index];
    openRef.current = nextOpen;
    setOpenIndices(nextOpen);
    if (nextOpen.length < 2) return;

    const [firstIndex, secondIndex] = nextOpen;
    if (cards[firstIndex].face === cards[secondIndex].face) {
      const claimedBy = turn;
      setCards((current) =>
        current.map((card, index2) =>
          index2 === firstIndex || index2 === secondIndex ? { ...card, claimedBy } : card,
        ),
      );
      openRef.current = [];
      setOpenIndices([]);
      playGiggleSound();
      const nextScores: [number, number] = [...scores];
      nextScores[claimedBy] += 1;
      setScores(nextScores);
      const outcome = memoryOutcome(nextScores, MEMORY_PAIR_COUNT);
      if (outcome !== null) {
        finishedRef.current = true;
        onWin(players[outcome]);
      }
    } else {
      mismatchLockRef.current = true;
      playMissSound();
      const timer = setTimeout(() => {
        openRef.current = [];
        setOpenIndices([]);
        mismatchLockRef.current = false;
        setTurn((current) => (current === 0 ? 1 : 0));
      }, MISMATCH_HOLD_MS);
      timersRef.current.push(timer);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <DuelTurnBanner
        uid={players[turn]}
        members={members}
        hint={t("expenses.memoryHint")}
        aside={
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-medium">
            <span style={{ color: colorA }}>
              {t("expenses.memoryScoreLabel", {
                name: members[players[0]].displayName,
                count: scores[0],
              })}
            </span>
            <span style={{ color: colorB }}>
              {t("expenses.memoryScoreLabel", {
                name: members[players[1]].displayName,
                count: scores[1],
              })}
            </span>
          </div>
        }
      />
      <div className="bg-muted/30 mx-auto grid w-full max-w-[340px] grid-cols-6 gap-1.5 rounded-xl border p-2">
        {cards.map((card, index) => {
          const faceUp = card.claimedBy !== null || openIndices.includes(index);
          const claimerColor =
            card.claimedBy === null ? undefined : card.claimedBy === 0 ? colorA : colorB;
          return (
            <button
              key={card.id}
              type="button"
              disabled={locked || card.claimedBy !== null || faceUp}
              onClick={() => flipCard(index)}
              aria-label={
                faceUp ? t("expenses.memoryCardRevealed") : t("expenses.memoryCardHidden")
              }
              className={cn(
                "flex aspect-square touch-manipulation items-center justify-center rounded-lg border text-lg transition-[opacity,border-color] duration-(--duration-fast)",
                card.claimedBy !== null ? "opacity-45" : "bg-card",
              )}
              style={claimerColor ? { borderColor: claimerColor, borderWidth: 2 } : undefined}
            >
              {faceUp ? card.face : <span className="text-muted-foreground text-xs">?</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
