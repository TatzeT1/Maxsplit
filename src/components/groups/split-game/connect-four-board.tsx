"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { preload } from "react-dom";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  CF_COLUMNS,
  CF_ROWS,
  applyConnectFourMove,
  emptyConnectFourBoard,
  type ConnectFourBoard as ConnectFourBoardState,
} from "@/lib/games/connect-four";
import { playReelStopSound } from "@/lib/sound/game-sounds";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import { cn } from "@/lib/utils";
import { TintedPiece } from "@/components/groups/split-game/tinted-piece";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

/** One match on a 7×6 board. Remounted fresh for every new match and every draw replay. */
export function ConnectFourBoard({ players, members, locked, onWin, onDraw }: DuelBoardProps) {
  const t = useT();
  const [board, setBoard] = useState<ConnectFourBoardState>(emptyConnectFourBoard());
  const [winCells, setWinCells] = useState<[number, number][] | null>(null);
  const [lastDrop, setLastDrop] = useState<{ col: number; row: number } | null>(null);
  const finishedRef = useRef(false);

  const totalDiscs = board.reduce((sum, column) => sum + column.length, 0);
  const turn = (totalDiscs % 2) as 0 | 1;
  const [colorA, colorB] = duelPalettes(
    members[players[0]].displayName,
    members[players[1]].displayName,
  );

  function dropInColumn(column: number) {
    if (locked || finishedRef.current || board[column].length >= CF_ROWS) return;
    const result = applyConnectFourMove(board, column, turn);
    setBoard(result.board);
    setLastDrop({ col: column, row: result.row });
    playReelStopSound();
    if (result.winner) {
      finishedRef.current = true;
      setWinCells(result.winner.cells);
      onWin(players[result.winner.player]);
    } else if (result.draw) {
      finishedRef.current = true;
      onDraw();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <DuelTurnBanner uid={players[turn]} members={members} hint={t("expenses.connectFourHint")} />
      <ConnectFourGrid
        board={board}
        winCells={winCells}
        lastDrop={lastDrop}
        colors={[colorA, colorB]}
        names={[members[players[0]].displayName, members[players[1]].displayName]}
        disabled={locked}
        onDrop={dropInColumn}
      />
    </div>
  );
}

/** The 7×6 drop board itself, stateless — shared by the one-phone board and the online board. */
export function ConnectFourGrid({
  board,
  winCells,
  lastDrop,
  colors,
  names,
  disabled,
  onDrop,
}: {
  board: ConnectFourBoardState;
  winCells: [number, number][] | null;
  lastDrop: { col: number; row: number } | null;
  colors: [string, string];
  names: [string, string];
  disabled: boolean;
  onDrop: (column: number) => void;
}) {
  preload("/duel/c4-disc.webp", { as: "image" });
  const t = useT();
  const reduceMotion = useReducedMotion();
  return (
    <div
      className="mx-auto grid w-full max-w-[min(34rem,calc(var(--game-board-h,274px)_*_1.17))] grid-cols-7 gap-1 bg-size-[100%_100%] p-3"
      style={{ backgroundImage: "url(/duel/c4-board.webp)" }}
    >
      {Array.from({ length: CF_COLUMNS }, (_, col) => {
        const full = board[col].length >= CF_ROWS;
        return (
          <button
            key={col}
            type="button"
            disabled={disabled || full}
            onClick={() => onDrop(col)}
            aria-label={
              full
                ? t("expenses.connectFourColumnFull", { n: col + 1 })
                : t("expenses.connectFourColumnLabel", { n: col + 1 })
            }
            className="flex touch-manipulation flex-col-reverse gap-1 rounded-md disabled:opacity-60"
          >
            {Array.from({ length: CF_ROWS }, (_, row) => {
              const value = board[col][row];
              const isWin = winCells?.some(([c, r]) => c === col && r === row) ?? false;
              const isLast = lastDrop?.col === col && lastDrop?.row === row;
              const disc = value !== undefined && (
                <TintedPiece
                  src="/duel/c4-disc.webp"
                  color={colors[value]}
                  className="size-full text-[10px] font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]"
                >
                  {names[value].charAt(0).toUpperCase()}
                </TintedPiece>
              );
              return (
                <span
                  key={row}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-full",
                    value === undefined && "bg-[#133f3c] shadow-[inset_0_2px_4px_rgb(0_0_0/0.55)]",
                    isWin && "ring-destructive ring-2",
                  )}
                >
                  {value !== undefined && isLast && !reduceMotion ? (
                    <motion.span
                      // Keyed by position so a replayed snapshot doesn't re-drop an old disc.
                      key={`${col}-${row}`}
                      initial={{ y: -220, opacity: 0.4 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 28, mass: 0.7 }}
                      className="size-full"
                    >
                      {disc}
                    </motion.span>
                  ) : (
                    disc
                  )}
                </span>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}
