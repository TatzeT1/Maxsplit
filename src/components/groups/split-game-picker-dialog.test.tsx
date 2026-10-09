import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const mocks = vi.hoisted(() => ({ online: true, preload: vi.fn() }));
vi.mock("@/lib/use-online", () => ({ useOnline: () => mocks.online }));
vi.mock("@/components/groups/split-game/game-loaders", () => ({
  preloadSplitGame: mocks.preload,
}));
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

import { LocaleProvider } from "@/components/locale-provider";
import { SPLIT_GAMES } from "@/components/groups/split-game/game-catalog";
import { recordRecentGame } from "@/lib/games/game-memory";
import { de } from "@/lib/i18n/de";
import { SplitGamePickerDialog } from "./split-game-picker-dialog";

const onSelectGame = vi.fn();

function picker() {
  return render(
    <LocaleProvider initialLocale="de">
      <SplitGamePickerDialog open onOpenChange={vi.fn()} onSelectGame={onSelectGame} groupId="g1" />
    </LocaleProvider>,
  );
}

const estimateTile = () => screen.getByRole("button", { name: /Schätzfragen/ });
const start = () => screen.getByRole("button", { name: "Los geht's" });

describe("SplitGamePickerDialog and games that need a connection", () => {
  beforeEach(() => {
    mocks.online = true;
    mocks.preload.mockReset();
    onSelectGame.mockReset();
    window.localStorage.clear();
  });

  it("starts the game from its preview while online, and preloads it", async () => {
    picker();
    fireEvent.click(estimateTile());
    expect(mocks.preload).toHaveBeenCalledWith("estimate");
    expect(start()).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      fireEvent.click(start());
    });
    expect(onSelectGame).toHaveBeenCalledWith("estimate");
  });

  it("keeps the tile visible offline, explains in the preview and disables the start", async () => {
    mocks.online = false;
    picker();
    fireEvent.click(estimateTile());
    // The preview slides in once the grid has left.
    expect(await screen.findByRole("alert")).toHaveTextContent(de.expenses.estimateNeedsConnection);
    expect(start()).toBeDisabled();
    expect(mocks.preload).not.toHaveBeenCalled();
    fireEvent.click(start());
    expect(onSelectGame).not.toHaveBeenCalled();
  });

  it("still preloads and starts a game that works offline", () => {
    mocks.online = false;
    picker();
    fireEvent.click(screen.getByRole("button", { name: /Wer zahlt\?/ }));
    expect(mocks.preload).toHaveBeenCalledWith("lottery");
    expect(start()).toBeEnabled();
    fireEvent.click(start());
    expect(onSelectGame).toHaveBeenCalledWith("lottery");
  });

  it("blocks the start when the connection drops while the preview is open", async () => {
    const view = picker();
    fireEvent.click(estimateTile());
    expect(start()).toBeEnabled();
    mocks.online = false;
    view.rerender(
      <LocaleProvider initialLocale="de">
        <SplitGamePickerDialog
          open
          onOpenChange={vi.fn()}
          onSelectGame={onSelectGame}
          groupId="g1"
        />
      </LocaleProvider>,
    );
    expect(start()).toBeDisabled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("leaves the game out of the recent row offline, because that tile skips the preview", () => {
    recordRecentGame("g1", "estimate");
    const view = picker();
    const recent = () => screen.queryByText(de.expenses.gamePickerRecent);
    expect(recent()).toBeInTheDocument();
    view.unmount();
    mocks.online = false;
    picker();
    expect(recent()).toBeNull();
  });

  it("never surprises with it offline", async () => {
    mocks.online = false;
    const random = vi.spyOn(Math, "random");
    try {
      for (let index = 0; index < SPLIT_GAMES.length; index++) {
        random.mockReturnValue(index / SPLIT_GAMES.length);
        const view = picker();
        fireEvent.click(screen.getByRole("button", { name: de.expenses.gamePickerSurprise }));
        expect(await screen.findByText(de.expenses.gamePreviewHowTitle)).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(start()).toBeEnabled();
        view.unmount();
      }
    } finally {
      random.mockRestore();
    }
  });
});
