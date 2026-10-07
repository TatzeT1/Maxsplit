import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The pause before „LOS!“ is a crypto draw; pinned here so the clock is known.
vi.mock("@/lib/games/random", async (original) => ({
  ...(await original<typeof import("@/lib/games/random")>()),
  randomInt: vi.fn(() => 2000),
}));

import { LocaleProvider } from "@/components/locale-provider";
import { GameRoundProvider } from "@/components/groups/split-game/game-round";
import { CATCH_FLASH_HOLD_MS } from "@/components/groups/split-game/celebration";
import { FINGER_MAX_DELAY_MS, FINGER_MIN_DELAY_MS, FINGER_REST_MS } from "@/lib/games/finger-race";
import { randomInt } from "@/lib/games/random";
import type { GroupMember } from "@/lib/types";
import { SplitFingerDialog } from "./split-finger-dialog";

// The rules are covered by finger-race.test.ts; this pins how the dialog
// feeds them real pointer events: which circle a finger belongs to, what a
// stray finger or a system cancel does, and what reaches `onResolve`.

function member(displayName: string): GroupMember {
  return {
    displayName,
    photoURL: "",
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: "member",
    isPlaceholder: false,
  };
}

const members = { lea: member("Lea"), max: member("Max"), ben: member("Ben") };
const uids = ["lea", "max", "ben"];

function renderDialog(onResolve = vi.fn()) {
  render(
    <LocaleProvider initialLocale="de">
      <GameRoundProvider value={{ round: 1, startRound: () => {} }}>
        <SplitFingerDialog
          open
          onOpenChange={() => {}}
          members={members}
          memberUids={uids}
          onResolve={onResolve}
        />
      </GameRoundProvider>
    </LocaleProvider>,
  );
  return onResolve;
}

function circle(uid: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-finger-circle="${uid}"]`);
  if (!element) throw new Error(`no circle for ${uid}`);
  return element;
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function down(uid: string, pointerId: number) {
  fireEvent.pointerDown(circle(uid), { pointerId, pointerType: "touch" });
}

function up(pointerId: number) {
  fireEvent.pointerUp(window, { pointerId, pointerType: "touch" });
}

/** Starts a game and puts every finger down (pointer ids 1, 2, 3), then lets them rest. */
function startAndArm() {
  fireEvent.click(screen.getByRole("button", { name: "Spiel starten" }));
  uids.forEach((uid, index) => down(uid, index + 1));
  wait(FINGER_REST_MS);
}

/** Long enough for the reveal and every slip of a one-payer game. */
const SLIPS_MS = 900 + CATCH_FLASH_HOLD_MS + 100;

describe("Finger drauf!", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes the slowest finger pay, and ignores a second finger on a held circle", () => {
    const onResolve = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Spiel starten" }));
    down("lea", 1);
    down("max", 2);
    expect(screen.getByText("Noch nicht drauf: Ben")).toBeInTheDocument();
    down("ben", 3);
    // Lea rests a second finger on her circle and takes it off again: nothing happens.
    down("lea", 4);
    up(4);
    expect(screen.getByText("Ruhig halten …")).toBeInTheDocument();

    wait(FINGER_REST_MS);
    expect(screen.getAllByText("Achtung … nicht loslassen!").length).toBeGreaterThan(0);
    expect(randomInt).toHaveBeenCalledWith(FINGER_MIN_DELAY_MS, FINGER_MAX_DELAY_MS);

    wait(2000);
    expect(screen.getAllByText("LOS!").length).toBeGreaterThan(0);
    wait(210);
    up(1);
    wait(90);
    up(2);
    // Ben's finger is still down, but nothing he does now can save him.
    wait(100);
    expect(screen.getByText("210 ms")).toBeInTheDocument();
    expect(screen.getByText("300 ms")).toBeInTheDocument();

    wait(SLIPS_MS);
    expect(screen.getAllByText("Ben zahlt.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onResolve).toHaveBeenCalledWith(["ben"], uids);
  });

  it("makes a finger lifted before „LOS!“ pay, and never shows the signal", () => {
    const onResolve = renderDialog();
    startAndArm();
    wait(500);
    up(2);
    wait(100);
    expect(screen.getAllByText("Fehlstart!").length).toBeGreaterThan(0);
    wait(5000);
    expect(screen.queryByText("LOS!")).toBeNull();
    expect(screen.getAllByText("Max zahlt.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onResolve).toHaveBeenCalledWith(["max"], uids);
  });

  it("lets a finger come off freely while the table is still gathering", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Spiel starten" }));
    down("lea", 1);
    down("max", 2);
    up(1);
    down("ben", 3);
    wait(FINGER_REST_MS * 3);
    expect(screen.getByText("Noch nicht drauf: Lea")).toBeInTheDocument();
    expect(screen.queryByText("Fehlstart!")).toBeNull();
  });

  it("voids the round on a pointercancel before „LOS!“ — no false start, everyone again", () => {
    const onResolve = renderDialog();
    startAndArm();
    wait(500);
    fireEvent.pointerCancel(window, { pointerId: 2, pointerType: "touch" });
    wait(1000);
    expect(
      screen.getAllByText(/Das Handy hat einen Finger verloren, die Runde zählt nicht/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Fehlstart!")).toBeNull();
    expect(screen.getByText("Noch nicht drauf: Lea, Max und Ben")).toBeInTheDocument();

    // The replay is a full round again.
    uids.forEach((uid, index) => down(uid, index + 11));
    wait(FINGER_REST_MS + 2000 + 150);
    up(11);
    up(13);
    wait(100);
    wait(SLIPS_MS);
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onResolve).toHaveBeenCalledWith(["max"], uids);
  });

  it("can't be undone by a cancel once the round is decided", () => {
    const onResolve = renderDialog();
    startAndArm();
    wait(2000 + 200);
    up(1);
    up(2);
    wait(100);
    // Ben slaps his palm down: the round has already closed.
    fireEvent.pointerCancel(window, { pointerId: 3, pointerType: "touch" });
    wait(SLIPS_MS);
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onResolve).toHaveBeenCalledWith(["ben"], uids);
  });

  it("says when the group is too big for this screen", () => {
    // jsdom has no touchscreen to report; a phone that tracks two fingers.
    Object.defineProperty(navigator, "maxTouchPoints", { value: 2, configurable: true });
    try {
      renderDialog();
      expect(screen.getByRole("alert")).toHaveTextContent("höchstens 2 Finger");
      expect(screen.getByRole("button", { name: "Spiel starten" })).toBeDisabled();
    } finally {
      delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
    }
  });
});
