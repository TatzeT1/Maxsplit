"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  EMPTY_TIC_TAC_TOE_STATE,
  applyTicTacToeMove,
  ticTacToeCells,
  ticTacToeNextToVanish,
  ticTacToeVariantForAttempt,
  type TicTacToeCell,
  type TicTacToeState,
} from "@/lib/games/tic-tac-toe";
import { playReelStopSound } from "@/lib/sound/game-sounds";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import { cn } from "@/lib/utils";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

/** One 3×3 match. Remounted (via the shell's `key={pairing.key}`) for every new match and every draw replay, so its state never has to be reset by hand. */
export function TicTacToeBoard({
  players,
  members,
  attempt,
  locked,
  onWin,
  onDraw,
}: DuelBoardProps) {
  const t = useT();
  const [state, setState] = useState<TicTacToeState>(EMPTY_TIC_TAC_TOE_STATE);
  const [winLine, setWinLine] = useState<readonly [number, number, number] | null>(null);
  const finishedRef = useRef(false);

  const variant = ticTacToeVariantForAttempt(attempt);
  const cells = ticTacToeCells(state);
  const turn = ((state.moves[0].length + state.moves[1].length) % 2) as 0 | 1;
  const nextToVanish = ticTacToeNextToVanish(state, turn, variant);
  const [colorA, colorB] = duelPalettes(
    members[players[0]].displayName,
    members[players[1]].displayName,
  );

  function tapCell(index: number) {
    if (locked || finishedRef.current || cells[index] !== null) return;
    const result = applyTicTacToeMove(state, turn, index, variant);
    setState(result.state);
    playReelStopSound();
    if (result.winner) {
      finishedRef.current = true;
      setWinLine(result.winner.line);
      onWin(players[result.winner.player]);
    } else if (result.draw) {
      finishedRef.current = true;
      onDraw();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <DuelTurnBanner uid={players[turn]} members={members} hint={t("expenses.ticTacToeHint")} />
      {variant === "vanishing" && (
        <p className="text-muted-foreground text-center text-xs">
          {t("expenses.ticTacToeSuddenDeath")}
        </p>
      )}
      <TicTacToeGrid
        cells={cells}
        winLine={winLine}
        nextToVanish={nextToVanish}
        turn={turn}
        colors={[colorA, colorB]}
        names={[members[players[0]].displayName, members[players[1]].displayName]}
        disabled={locked}
        onTap={tapCell}
      />
    </div>
  );
}

/**
 * The 3×3 grid itself, stateless — shared by the one-phone board above and
 * the online board (`online-boards.tsx`), so both look and read identically.
 */
export function TicTacToeGrid({
  cells,
  winLine,
  nextToVanish,
  turn,
  colors,
  names,
  disabled,
  onTap,
}: {
  cells: TicTacToeCell[];
  winLine: readonly [number, number, number] | null;
  nextToVanish: number | null;
  turn: 0 | 1;
  colors: [string, string];
  names: [string, string];
  disabled: boolean;
  onTap: (index: number) => void;
}) {
  const t = useT();
  return (
    <div className="bg-muted/30 mx-auto grid w-full max-w-[280px] grid-cols-3 gap-2 rounded-xl border p-2">
      {cells.map((value, index) => {
        const row = Math.floor(index / 3) + 1;
        const col = (index % 3) + 1;
        const isWinCell = winLine?.includes(index) ?? false;
        const vanishing = value !== null && nextToVanish === index && value === turn;
        return (
          <button
            key={index}
            type="button"
            disabled={disabled || value !== null}
            onClick={() => onTap(index)}
            aria-label={
              value === null
                ? t("expenses.ticTacToeCellLabel", { row, col })
                : t("expenses.ticTacToeCellLabelTaken", { row, col, name: names[value] })
            }
            className={cn(
              "flex aspect-square touch-manipulation items-center justify-center rounded-lg border text-3xl font-bold transition-[opacity,background-color,border-color] duration-(--duration-fast)",
              isWinCell ? "border-destructive/50 bg-destructive/10" : "border-border bg-card",
            )}
          >
            {value !== null && (
              <span className={cn(vanishing && "opacity-40")} style={{ color: colors[value] }}>
                {value === 0 ? "✕" : "◯"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
