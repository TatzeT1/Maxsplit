import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isGameSoundsMuted } from "@/lib/sound/game-sounds";
import { GameRoundProvider } from "./game-round";
import { GameDialogContent } from "./game-stage";

function renderStage(round: number, soundToggle?: boolean) {
  render(
    <LocaleProvider initialLocale="de">
      <GameRoundProvider value={{ round, startRound: () => {} }}>
        <Dialog open>
          <GameDialogContent soundToggle={soundToggle} aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Glücksrad</DialogTitle>
            </DialogHeader>
            <p>Brett</p>
          </GameDialogContent>
        </Dialog>
      </GameRoundProvider>
    </LocaleProvider>,
  );
}

describe("the game stage", () => {
  beforeEach(() => window.localStorage.clear());

  it("says nothing about attempts on the first round", () => {
    renderStage(1);
    expect(screen.queryByText(/Versuch/)).toBeNull();
  });

  it("tells the table from the second round on that it's a reshuffle", () => {
    renderStage(3);
    expect(screen.getByText("3. Versuch — steht später an der Ausgabe")).toBeInTheDocument();
  });

  it("has a sound switch that every game shares", () => {
    renderStage(1);
    const toggle = screen.getByRole("button", { name: "Ton an oder aus" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(isGameSoundsMuted()).toBe(true);
    fireEvent.click(toggle);
    expect(isGameSoundsMuted()).toBe(false);
  });

  it("leaves the switch out for a game with its own", () => {
    renderStage(1, false);
    expect(screen.queryByRole("button", { name: "Ton an oder aus" })).toBeNull();
  });
});
