"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  DOTS_BOXES_PER_SIDE,
  DOTS_LINE_COUNT,
  DOTS_SIZE,
  applyDotsMove,
  dotsScore,
  isValidDotsMove,
  lineGeometry,
  replayDots,
  type DotsState,
} from "@/lib/games/dots-and-boxes";
import { playAppliedSound, playPencilSound } from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

/** One match on a 4×4-dot board (3×3 boxes). Remounted fresh for every new match by the shell. */
export function DotsBoard({ players, members, locked, onWin }: DuelBoardProps) {
  const t = useT();
  const [lines, setLines] = useState<number[]>([]);
  const finishedRef = useRef(false);
  const replay = replayDots(lines);
  const names: [string, string] = [
    members[players[0]].displayName,
    members[players[1]].displayName,
  ];
  const colors = duelPalettes(names[0], names[1]);

  function draw(line: number) {
    if (locked || finishedRef.current || !isValidDotsMove(replay.state, line)) return;
    const result = applyDotsMove(replay.state, line, replay.turn);
    setLines([...lines, line]);
    if (result.completed.length > 0) playAppliedSound();
    else playPencilSound();
    if (result.winner !== null) {
      finishedRef.current = true;
      onWin(players[result.winner]);
    }
  }

  const score = dotsScore(replay.state);
  const closedABox = !replay.finished && (replay.last?.completed.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-3">
      <DuelTurnBanner
        uid={players[replay.turn]}
        members={members}
        hint={
          closedABox
            ? t("expenses.dotsBoxClosed", { name: names[replay.turn] })
            : t("expenses.dotsHint")
        }
        aside={<DotsScore score={score} names={names} colors={colors} />}
      />
      <DotsGrid
        state={replay.state}
        lastLine={replay.last?.line ?? null}
        colors={colors}
        names={names}
        disabled={locked}
        onLine={draw}
      />
    </div>
  );
}

/** "Anna: 3 Kästchen" for both players, in their colours. */
export function DotsScore({
  score,
  names,
  colors,
}: {
  score: [number, number];
  names: [string, string];
  colors: [string, string];
}) {
  const t = useT();
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-medium">
      {([0, 1] as const).map((seat) => (
        <span key={seat} style={{ color: colors[seat] }}>
          {t("expenses.dotsScoreLabel", { name: names[seat], count: score[seat] })}
        </span>
      ))}
    </div>
  );
}

// Board geometry in SVG units. The whole board is a 300×300 square that scales
// with its container; the tap targets are laid over it in percentages.
const MARGIN = 30;
const CELL = 80;
const VIEW = DOTS_BOXES_PER_SIDE * CELL + 2 * MARGIN;
/** Thickness of a line's tap target — at least a finger wide at the board's largest size. */
const HIT = 44;
/** How far a tap target stops short of the dots at either end, so neighbours don't overlap much. */
const HIT_INSET = 12;
const DOT_RADIUS = 6;

function dotX(col: number): number {
  return MARGIN + col * CELL;
}

function dotY(row: number): number {
  return MARGIN + row * CELL;
}

function lineEnds(line: number): { x1: number; y1: number; x2: number; y2: number } {
  const geometry = lineGeometry(line);
  const x1 = dotX(geometry.col);
  const y1 = dotY(geometry.row);
  return geometry.orientation === "h"
    ? { x1, y1, x2: dotX(geometry.col + 1), y2: y1 }
    : { x1, y1, x2: x1, y2: dotY(geometry.row + 1) };
}

function hitBox(line: number): { left: string; top: string; width: string; height: string } {
  const { x1, y1, x2, y2 } = lineEnds(line);
  const horizontal = y1 === y2;
  const left = horizontal ? x1 + HIT_INSET : x1 - HIT / 2;
  const top = horizontal ? y1 - HIT / 2 : y1 + HIT_INSET;
  const width = horizontal ? x2 - x1 - 2 * HIT_INSET : HIT;
  const height = horizontal ? HIT : y2 - y1 - 2 * HIT_INSET;
  const pct = (value: number) => `${(value / VIEW) * 100}%`;
  return { left: pct(left), top: pct(top), width: pct(width), height: pct(height) };
}

/**
 * The dot board, stateless — shared by the one-phone board and the online
 * board. Every line that is still open has a finger-sized button over it.
 */
export function DotsGrid({
  state,
  lastLine,
  colors,
  names,
  disabled,
  onLine,
}: {
  state: DotsState;
  /** The most recently drawn line, highlighted so a move from the other phone is easy to spot. */
  lastLine: number | null;
  colors: [string, string];
  names: [string, string];
  disabled: boolean;
  onLine: (line: number) => void;
}) {
  const t = useT();
  return (
    <div className="bg-card shadow-e1 relative mx-auto aspect-square w-full max-w-[300px] rounded-xl border">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        {state.boxes.map((owner, box) => {
          if (owner === null) return null;
          const row = Math.floor(box / DOTS_BOXES_PER_SIDE);
          const col = box % DOTS_BOXES_PER_SIDE;
          return (
            <g key={box}>
              <rect
                x={dotX(col) + 3}
                y={dotY(row) + 3}
                width={CELL - 6}
                height={CELL - 6}
                rx={8}
                fill={colors[owner]}
                fillOpacity={0.24}
              />
              <text
                x={dotX(col) + CELL / 2}
                y={dotY(row) + CELL / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={30}
                fontWeight={700}
                fill={colors[owner]}
              >
                {names[owner].charAt(0).toUpperCase() || "?"}
              </text>
            </g>
          );
        })}
        {Array.from({ length: DOTS_LINE_COUNT }, (_, line) => {
          const { x1, y1, x2, y2 } = lineEnds(line);
          const owner = state.lines[line];
          if (owner === null) {
            return (
              <line
                key={line}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeOpacity={0.18}
                strokeWidth={2}
                strokeDasharray="2 7"
                strokeLinecap="round"
              />
            );
          }
          return (
            <g key={line}>
              {line === lastLine && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={colors[owner]}
                  strokeOpacity={0.3}
                  strokeWidth={15}
                  strokeLinecap="round"
                />
              )}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={colors[owner]}
                strokeWidth={7}
                strokeLinecap="round"
              />
            </g>
          );
        })}
        {Array.from({ length: DOTS_SIZE * DOTS_SIZE }, (_, index) => (
          <circle
            key={index}
            cx={dotX(index % DOTS_SIZE)}
            cy={dotY(Math.floor(index / DOTS_SIZE))}
            r={DOT_RADIUS}
            fill="currentColor"
          />
        ))}
      </svg>
      {Array.from({ length: DOTS_LINE_COUNT }, (_, line) => {
        const geometry = lineGeometry(line);
        const open = state.lines[line] === null;
        return (
          <button
            key={line}
            type="button"
            disabled={disabled || !open}
            onClick={() => onLine(line)}
            aria-label={t(
              geometry.orientation === "h" ? "expenses.dotsLineLabelH" : "expenses.dotsLineLabelV",
              { row: geometry.row + 1, col: geometry.col + 1 },
            )}
            style={hitBox(line)}
            className={cn(
              "focus-visible:ring-ring/60 absolute touch-manipulation rounded-full transition-colors duration-(--duration-fast) focus-visible:ring-2",
              open && !disabled && "hover:bg-foreground/10 active:bg-foreground/20",
            )}
          />
        );
      })}
    </div>
  );
}
