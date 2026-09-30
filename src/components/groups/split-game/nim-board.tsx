"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  NIM_START_ROWS,
  applyNimMove,
  isValidNimMove,
  nimTotal,
  type NimReplay,
  type NimRows,
} from "@/lib/games/nim";
import { playReelStopSound } from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

/** One match on the classic 1·3·5·7 layout. Remounted fresh for every new match by the shell. */
export function NimBoard({ players, members, locked, onWin }: DuelBoardProps) {
  const t = useT();
  const [rows, setRows] = useState<NimRows>(NIM_START_ROWS);
  const [turn, setTurn] = useState<0 | 1>(0);
  const [last, setLast] = useState<NimReplay["last"]>(null);
  const finishedRef = useRef(false);
  const names: [string, string] = [
    members[players[0]].displayName,
    members[players[1]].displayName,
  ];
  const colors = duelPalettes(names[0], names[1]);

  function take(row: number, count: number) {
    if (locked || finishedRef.current || !isValidNimMove(rows, row, count)) return;
    const result = applyNimMove(rows, row, count, turn);
    setRows(result.rows);
    setLast({ row, count, player: turn });
    playReelStopSound();
    if (result.loser !== null) {
      // Taking the very last match loses, so the other player wins.
      finishedRef.current = true;
      onWin(players[result.loser === 0 ? 1 : 0]);
      return;
    }
    setTurn(turn === 0 ? 1 : 0);
  }

  return (
    <div className="flex flex-col gap-3">
      <DuelTurnBanner uid={players[turn]} members={members} hint={t("expenses.nimHint")} />
      <NimGrid
        rows={rows}
        last={last}
        colors={colors}
        names={names}
        turnColor={colors[turn]}
        disabled={locked}
        onTake={take}
      />
    </div>
  );
}

/**
 * The rows of matches, stateless apart from which matches are currently
 * picked — shared by the one-phone board and the online board. Tapping a
 * match picks it (picking in another row moves the pick there); "Nehmen"
 * takes every picked match at once.
 */
export function NimGrid({
  rows,
  last,
  colors,
  names,
  turnColor,
  disabled,
  onTake,
}: {
  rows: NimRows;
  last: NimReplay["last"];
  colors: [string, string];
  names: [string, string];
  /** The colour of whoever's move it is — the tint of the matches they have picked up. */
  turnColor: string;
  disabled: boolean;
  onTake: (row: number, count: number) => void;
}) {
  const t = useT();
  // A pick belongs to one layout: once any move changes the rows, it lapses.
  const rowsKey = rows.join("-");
  const [selection, setSelection] = useState<{ key: string; row: number; picked: number[] } | null>(
    null,
  );
  const active = selection && selection.key === rowsKey ? selection : null;
  const pickedCount = active?.picked.length ?? 0;

  function toggle(row: number, index: number) {
    if (disabled) return;
    if (!active || active.row !== row) {
      setSelection({ key: rowsKey, row, picked: [index] });
      return;
    }
    const picked = active.picked.includes(index)
      ? active.picked.filter((i) => i !== index)
      : [...active.picked, index];
    setSelection(picked.length === 0 ? null : { key: rowsKey, row, picked });
  }

  function confirmTake() {
    if (disabled || !active || pickedCount === 0) return;
    const { row } = active;
    setSelection(null);
    onTake(row, pickedCount);
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        aria-live="polite"
        className="text-muted-foreground min-h-5 text-center text-xs font-medium"
        style={last ? { color: colors[last.player] } : undefined}
      >
        {last
          ? t("expenses.nimLastMove", { name: names[last.player], count: last.count })
          : t("expenses.nimRemaining", { count: nimTotal(rows) })}
      </p>

      <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-2 rounded-xl border border-black/20 bg-[#1f5a4b] px-2 py-3 shadow-[inset_0_2px_10px_rgb(0_0_0/0.45)]">
        {rows.map((count, row) => (
          <div
            key={row}
            role="group"
            aria-label={t("expenses.nimRowLabel", { row: row + 1, count })}
            className="flex items-end justify-center gap-0.5"
          >
            {Array.from({ length: NIM_START_ROWS[row] }, (_, index) => {
              const present = index < count;
              const picked = active?.row === row && active.picked.includes(index);
              return (
                <button
                  key={index}
                  type="button"
                  disabled={disabled || !present}
                  aria-pressed={present ? picked : undefined}
                  aria-label={
                    present
                      ? t("expenses.nimMatchLabel", { n: index + 1, row: row + 1 })
                      : undefined
                  }
                  aria-hidden={present ? undefined : true}
                  tabIndex={present ? undefined : -1}
                  onClick={() => toggle(row, index)}
                  className="flex h-[78px] w-[38px] touch-manipulation items-end justify-center rounded-md"
                >
                  <Match present={present} picked={picked} color={turnColor} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <Button
        type="button"
        size="lg"
        disabled={disabled || pickedCount === 0}
        onClick={confirmTake}
        className="mx-auto w-full max-w-[320px]"
      >
        {pickedCount > 0
          ? t("expenses.nimTake", { count: pickedCount })
          : t("expenses.nimTakeNone")}
      </Button>
    </div>
  );
}

/** One upright match: a pale stem and a red-orange head. A taken match leaves only a faint mark on the felt. */
function Match({ present, picked, color }: { present: boolean; picked: boolean; color: string }) {
  if (!present) {
    return <span aria-hidden="true" className="mb-1 h-16 w-1.5 rounded-full bg-black/15" />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-[68px] w-3 flex-col items-center transition-transform duration-(--duration-fast)",
        picked && "-translate-y-2",
      )}
    >
      {picked && (
        <span
          className="absolute -inset-x-1.5 inset-y-0 rounded-full opacity-35 blur-[3px]"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="relative z-10 h-4 w-3.5 rounded-full bg-linear-to-b from-[#ff8a4c] to-[#d43a22] shadow-[inset_0_-2px_2px_rgb(0_0_0/0.3),0_1px_2px_rgb(0_0_0/0.4)]" />
      <span className="relative -mt-1.5 w-2 flex-1 rounded-b-[3px] bg-linear-to-r from-[#f6e2b3] via-[#ecd092] to-[#cfa866] shadow-[0_1px_2px_rgb(0_0_0/0.4)]" />
    </span>
  );
}
