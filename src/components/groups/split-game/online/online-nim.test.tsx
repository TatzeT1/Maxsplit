import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { encodeNimMove, encodeNimSkip } from "@/lib/games/nim";
import type { LiveMatch } from "@/lib/types";
import { OnlineNim, type OnlineBoardProps } from "./online-boards";

// The online matchstick board: what a tap, the joker and a burnt fuse send to
// the server, and who the fuse is allowed to act for. (The rules themselves
// are covered by nim.test.ts and online-match.test.ts.)

const names: [string, string] = ["Anna", "Ben"];
const colors: [string, string] = ["#ff8a1f", "#2bb3a8"];

function liveOf(moves: number[]): LiveMatch {
  return {
    id: "m1",
    gameId: "nim",
    players: ["anna", "ben"],
    attempt: 0,
    state: { gameId: "nim", moves },
    version: moves.length,
    lastDrawAt: null,
    winnerUid: null,
    finish: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderBoard(moves: number[], props: Partial<OnlineBoardProps> = {}) {
  const onMove = vi.fn();
  const live = liveOf(moves);
  render(
    <LocaleProvider initialLocale="de">
      <OnlineNim
        live={live}
        state={live.state}
        me={0}
        names={names}
        colors={colors}
        busy={false}
        onMove={onMove}
        {...props}
      />
    </LocaleProvider>,
  );
  return onMove;
}

const match = (n: number, row: number) =>
  screen.getByRole("button", { name: `Ab Streichholz ${n} in Reihe ${row} wählen` });
const joker = () => screen.getByRole("button", { name: /Joker spielen/ });

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

describe("OnlineNim", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  const elapse = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  describe("on your move", () => {
    it("takes the picked match and everything to its right in that row", () => {
      const onMove = renderBoard([]);
      fireEvent.click(match(4, 4)); // the 7-row: matches 4..7 are four
      fireEvent.click(screen.getByRole("button", { name: "4 nehmen" }));
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith({ kind: "take", row: 3, count: 4 });
    });

    it("moves the pick when another match is tapped, and drops it when tapped again", () => {
      renderBoard([]);
      fireEvent.click(match(2, 4));
      expect(screen.getByRole("button", { name: "6 nehmen" })).toBeEnabled();
      fireEvent.click(match(6, 4));
      expect(screen.getByRole("button", { name: "2 nehmen" })).toBeEnabled();
      fireEvent.click(match(6, 4));
      expect(screen.getByRole("button", { name: "Nehmen" })).toBeDisabled();
    });

    it("plays the joker", () => {
      const onMove = renderBoard([]);
      expect(joker()).toBeEnabled();
      fireEvent.click(joker());
      expect(onMove).toHaveBeenCalledWith({ kind: "skip" });
    });

    it("has no joker to play once it is spent", () => {
      // p0 skipped, p1 took a match — p0 is on the move again, without a joker.
      renderBoard([encodeNimSkip(), encodeNimMove(0, 1)]);
      expect(joker()).toBeDisabled();
    });

    it("ignores taps while its own move is still on its way", () => {
      const onMove = renderBoard([], { busy: true });
      expect(match(1, 1)).toBeDisabled();
      expect(joker()).toBeDisabled();
      expect(onMove).not.toHaveBeenCalled();
    });
  });

  describe("on the other player's move", () => {
    it("lets nothing be picked or played", () => {
      const onMove = renderBoard([], { me: 1 }); // player 0 is on the move
      expect(match(1, 1)).toBeDisabled();
      expect(screen.getByRole("button", { name: "Nehmen" })).toBeDisabled();
      expect(joker()).toBeDisabled();
      expect(onMove).not.toHaveBeenCalled();
    });

    it("lets a spectator watch only", () => {
      renderBoard([], { me: null });
      expect(match(1, 1)).toBeDisabled();
      expect(joker()).toBeDisabled();
    });
  });

  describe("the fuse", () => {
    const afterOneMove = [encodeNimMove(0, 1)]; // player 1 is on the move, the fuse is lit

    it("is not lit before the first move", () => {
      const onMove = renderBoard([]);
      expect(screen.queryByRole("timer")).toBeNull();
      elapse(60_000);
      expect(onMove).not.toHaveBeenCalled();
    });

    it("burns down on the screen of the player on the move", () => {
      renderBoard(afterOneMove, { me: 1 });
      expect(screen.getByRole("timer")).toHaveAccessibleName("Lunte: noch 15 Sekunden");
      elapse(4_000);
      expect(screen.getByRole("timer").getAttribute("aria-label")).toMatch(/noch 1[01] Sekunden/);
    });

    it("plays one late match for the player on the move when it runs out — once", () => {
      const onMove = renderBoard(afterOneMove, { me: 1 });
      elapse(14_000);
      expect(onMove).not.toHaveBeenCalled();
      elapse(2_000);
      expect(onMove).toHaveBeenCalledTimes(1);
      const move = onMove.mock.calls[0][0];
      expect(move).toMatchObject({ kind: "take", count: 1, late: true });
      // Row 0's only match is gone; the late move must come from a row that has some.
      expect([1, 2, 3]).toContain(move.row);
      elapse(30_000);
      expect(onMove).toHaveBeenCalledTimes(1);
    });

    it("burns on the other player's screen too, but never acts for them", () => {
      const onMove = renderBoard(afterOneMove, { me: 0 });
      expect(screen.getByRole("timer")).toBeInTheDocument();
      elapse(40_000);
      expect(onMove).not.toHaveBeenCalled();
    });

    it("does not act while its own move is on its way", () => {
      const onMove = renderBoard(afterOneMove, { me: 1, busy: true });
      elapse(40_000);
      expect(onMove).not.toHaveBeenCalled();
    });

    it("stands still offline: a move could not be sent anyway", () => {
      setOnline(false);
      const onMove = renderBoard(afterOneMove, { me: 1 });
      elapse(40_000);
      expect(onMove).not.toHaveBeenCalled();
      expect(screen.getByRole("timer")).toHaveAccessibleName("Lunte: noch 15 Sekunden");
    });

    it("is gone once the match is decided", () => {
      const moves = [
        encodeNimMove(0, 1),
        encodeNimMove(1, 3),
        encodeNimMove(2, 5),
        encodeNimMove(3, 6),
        encodeNimMove(3, 1),
      ];
      const live = { ...liveOf(moves), winnerUid: "ben" };
      const onMove = vi.fn();
      render(
        <LocaleProvider initialLocale="de">
          <OnlineNim
            live={live}
            state={live.state}
            me={0}
            names={names}
            colors={colors}
            busy={false}
            onMove={onMove}
          />
        </LocaleProvider>,
      );
      expect(screen.queryByRole("timer")).toBeNull();
      elapse(40_000);
      expect(onMove).not.toHaveBeenCalled();
    });
  });

  it("says out loud when the fuse played a move", () => {
    renderBoard([encodeNimMove(0, 1), encodeNimMove(2, 1, true)], { me: 0 });
    expect(screen.getByText("Zu langsam! Für Ben wurde 1 Hölzchen genommen.")).toBeInTheDocument();
  });

  it("says when somebody used their joker", () => {
    renderBoard([encodeNimSkip()], { me: 1 });
    expect(screen.getByText("Anna setzt aus — Joker verbraucht!")).toBeInTheDocument();
  });
});
