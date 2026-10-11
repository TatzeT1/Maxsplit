import { act, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ appRouter: false }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Offline: the lazily imported audit chunk cannot be fetched, so the loader's promise rejects.
vi.mock("@/components/groups/split-game/estimate/estimate-audit", async () => {
  throw new Error("Loading chunk failed");
});
// `next/dynamic` is the pages-style runtime under Node (a failure arrives as the loading slot's
// `error`); the App Router build uses React.lazy, where it THROWS at render. Test both.
vi.mock("next/dynamic", async () => {
  const pages = await vi.importActual<{ default: (...args: unknown[]) => ComponentType }>(
    "next/dynamic",
  );
  const app = await vi.importActual<{ default: (options: unknown) => ComponentType }>(
    "next/dist/shared/lib/lazy-dynamic/loadable",
  );
  return {
    default: (loader: unknown, options: object) =>
      h.appRouter ? app.default({ loader, ...options }) : pages.default(loader, options),
  };
});

import { LocaleProvider } from "@/components/locale-provider";
import { decidedAudit, makeSplits } from "./estimate/estimate-test-data";
import { GameRecordSummary } from "./game-record";

function renderRecord() {
  return render(
    <LocaleProvider initialLocale="de">
      <GameRecordSummary
        game={{
          gameId: "estimate",
          playerUids: ["lea", "max", "ben"],
          attempt: 1,
          estimate: decidedAudit(),
        }}
        showPlayers
        expense={{
          amountMinor: 3000,
          currency: "EUR",
          splits: makeSplits({ lea: 0, max: 0, ben: 3000 }),
        }}
      />
      <p>Rest des Dialogs</p>
    </LocaleProvider>,
  );
}

describe("GameRecordSummary when the audit chunk fails to load", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["the pages-style loader (error in the loading slot)", false],
    ["the App Router loader (thrown at render, caught by the boundary)", true],
  ])(
    "keeps the summary and its siblings and says the record is unavailable: %s",
    async (_, app) => {
      h.appRouter = app;
      vi.spyOn(console, "error").mockImplementation(() => {});
      renderRecord();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(screen.getByText("Das Protokoll lässt sich gerade nicht laden.")).toBeVisible();
      expect(screen.getByText(/Schätzfragen/)).toBeInTheDocument();
      expect(screen.getByText("Rest des Dialogs")).toBeInTheDocument();
      expect(document.querySelector("details")).toBeNull();
      expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
    },
  );
});
