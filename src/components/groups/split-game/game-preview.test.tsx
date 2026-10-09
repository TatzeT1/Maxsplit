import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const mocks = vi.hoisted(() => ({ online: true }));
vi.mock("@/lib/use-online", () => ({ useOnline: () => mocks.online }));
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

import { LocaleProvider } from "@/components/locale-provider";
import { de } from "@/lib/i18n/de";
import { splitGameInfo } from "./game-catalog";
import { SplitGamePreview } from "./game-preview";

function preview(id: Parameters<typeof splitGameInfo>[0]) {
  return render(
    <LocaleProvider initialLocale="de">
      <SplitGamePreview game={splitGameInfo(id)} />
    </LocaleProvider>,
  );
}

describe("SplitGamePreview", () => {
  beforeEach(() => {
    mocks.online = true;
  });

  it("explains how the game works", () => {
    preview("estimate");
    expect(screen.getByText(de.expenses.gameHowEstimate)).toBeInTheDocument();
  });

  it("says why a game that needs a connection can't start while offline, in a visible alert", () => {
    mocks.online = false;
    preview("estimate");
    expect(screen.getByRole("alert")).toHaveTextContent(de.expenses.estimateNeedsConnection);
  });

  it("shows no alert while online", () => {
    preview("estimate");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("never blames the connection for a game that works offline", () => {
    mocks.online = false;
    preview("lottery");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
