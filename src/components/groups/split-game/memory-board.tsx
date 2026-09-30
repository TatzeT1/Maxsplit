"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  MEMORY_FACES,
  MEMORY_PAIR_COUNT,
  buildMemoryDeck,
  isMemoryFace,
  memoryOutcome,
  type MemoryCard,
  type MemoryFace,
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
      <MemoryGrid
        cards={cards.map((card, index) => ({
          key: card.id,
          face: card.claimedBy !== null || openIndices.includes(index) ? card.face : null,
          claimedBy: card.claimedBy,
        }))}
        colors={[colorA, colorB]}
        disabled={locked}
        onFlip={flipCard}
      />
    </div>
  );
}

/** One card as the grid draws it: `face` is `null` while face down. */
export interface MemoryGridCard {
  key: number;
  face: string | null;
  claimedBy: 0 | 1 | null;
}

/**
 * The card grid — 6×3, or 3×6 on a portrait screen so the cards use the
 * phone's height instead of shrinking to fit six across — stateless — shared by the one-phone board and the
 * online board, where a face only exists client-side once the server has
 * revealed it.
 */
export function MemoryGrid({
  cards,
  colors,
  disabled,
  onFlip,
}: {
  cards: MemoryGridCard[];
  colors: [string, string];
  disabled: boolean;
  onFlip: (index: number) => void;
}) {
  return (
    <div
      className="mx-auto grid w-full max-w-[min(40rem,calc(var(--game-board-h,170px)_*_2))] grid-cols-6 gap-1.5 rounded-xl border bg-cover bg-center p-2.5 portrait:max-w-[min(30rem,calc(var(--game-board-h,680px)_/_2))] portrait:grid-cols-3"
      style={{ backgroundImage: "url(/memory/background.webp)" }}
    >
      {cards.map((card, index) => (
        <MemoryCardButton
          key={card.key}
          card={card}
          claimerColor={card.claimedBy === null ? undefined : colors[card.claimedBy]}
          disabled={disabled}
          onFlip={() => onFlip(index)}
        />
      ))}
      {/* Faces only reach the grid once revealed, so fetch all twelve up front — otherwise the first flip of each face shows an empty card while its image loads. */}
      <div hidden aria-hidden="true">
        {MEMORY_FACES.map((face) => (
          <FaceImage key={face} face={face} loading="eager" />
        ))}
      </div>
    </div>
  );
}

/**
 * One card, flipped in 3D between the shared back and its face. It remembers
 * the last face it showed so a mismatched pair keeps its picture while it
 * turns back over — the grid clears `face` the instant the turn passes.
 */
function MemoryCardButton({
  card,
  claimerColor,
  disabled,
  onFlip,
}: {
  card: MemoryGridCard;
  claimerColor: string | undefined;
  disabled: boolean;
  onFlip: () => void;
}) {
  const t = useT();
  const faceUp = card.face !== null;
  const [shownFace, setShownFace] = useState(card.face);
  if (card.face !== null && card.face !== shownFace) setShownFace(card.face);

  return (
    <button
      type="button"
      disabled={disabled || card.claimedBy !== null || faceUp}
      onClick={onFlip}
      aria-label={faceUp ? t("expenses.memoryCardRevealed") : t("expenses.memoryCardHidden")}
      className={cn(
        "aspect-square touch-manipulation transition-opacity duration-(--duration-base) perspective-[400px]",
        card.claimedBy !== null && "opacity-60",
      )}
    >
      <span
        className={cn(
          "relative block size-full transition-transform duration-(--duration-slow) ease-out transform-3d",
          faceUp && "rotate-y-180",
        )}
      >
        <span className="shadow-e1 absolute inset-0 overflow-hidden rounded-lg backface-hidden">
          <Image src="/memory/card-back.webp" alt="" fill sizes="64px" unoptimized />
        </span>
        <span
          className="shadow-e1 absolute inset-0 flex rotate-y-180 items-center justify-center overflow-hidden rounded-lg border bg-white backface-hidden"
          style={claimerColor ? { borderColor: claimerColor, borderWidth: 2 } : undefined}
        >
          {shownFace !== null &&
            (isMemoryFace(shownFace) ? (
              <FaceImage face={shownFace} />
            ) : (
              <span className="text-lg">{shownFace}</span>
            ))}
        </span>
      </span>
    </button>
  );
}

function FaceImage({ face, loading }: { face: MemoryFace; loading?: "eager" }) {
  return (
    <Image
      src={`/memory/faces/${face}.webp`}
      alt=""
      width={64}
      height={64}
      loading={loading}
      unoptimized
      className="size-[88%] object-contain"
    />
  );
}
