import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Next = (snapshot: unknown) => void;
type Fail = (error: { code: string }) => void;
interface Listener {
  path: string;
  next: Next;
  fail: Fail;
}

const h = vi.hoisted(() => ({ listeners: [] as Listener[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path }),
  onSnapshot: (ref: { path: string[] }, _options: unknown, next: Next, fail: Fail) => {
    h.listeners.push({ path: ref.path.join("/"), next, fail });
    return () => {};
  },
}));
vi.mock("@/lib/firebase/client", () => ({ db: {}, auth: {} }));
vi.mock("@/lib/firebase/use-current-user", () => ({ useCurrentUser: () => ({ uid: "lea" }) }));

import { LocaleProvider } from "@/components/locale-provider";
import type { EstimateRound, Group } from "@/lib/types";
import { EstimateRoundBanner } from "./estimate-round-banner";
import {
  DEGREES_QUESTION,
  RATIO_QUESTION,
  makeReveal,
  makeRound,
  makeStage,
} from "./split-game/estimate/estimate-test-data";

const NOW = new Date("2026-05-01T10:00:00.000Z");
const ENTRANTS = {
  lea: { displayName: "Lea", isPlaceholder: false },
  max: { displayName: "Max", isPlaceholder: false },
  ben: { displayName: "Ben", isPlaceholder: false },
};

const GROUP = { id: "g1", activeEstimateRound: { id: "r1" } } as unknown as Group;

function running(
  stage: Parameters<typeof makeStage>[3] = {},
  overrides: Partial<EstimateRound> = {},
) {
  return makeRound(
    [
      makeStage(RATIO_QUESTION, ["lea", "max", "ben"], null, {
        closesAt: new Date(NOW.getTime() + 300_000).toISOString(),
        slots: 1,
        ...stage,
      }),
    ],
    { mode: "online", id: "r1", entrants: ENTRANTS, order: ["lea", "max", "ben"], ...overrides },
  );
}

function deliver(data: object | null, fromCache = false) {
  const listener = h.listeners[h.listeners.length - 1];
  act(() =>
    listener.next({
      id: "r1",
      exists: () => data !== null,
      data: () => data,
      metadata: { fromCache },
    }),
  );
}

function renderBanner(group: Group = GROUP, uid = "lea") {
  return render(
    <LocaleProvider initialLocale="de">
      <EstimateRoundBanner group={group} currentUid={uid} />
    </LocaleProvider>,
  );
}

describe("EstimateRoundBanner", () => {
  beforeEach(() => {
    h.listeners.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("costs no listener and renders nothing for a group without a round", () => {
    const { container } = renderBanner({ id: "g1" } as unknown as Group);
    expect(container).toBeEmptyDOMElement();
    expect(h.listeners).toHaveLength(0);
  });

  it("links to the round and shows the title alone until the round has loaded", () => {
    renderBanner();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/groups/g1/estimate/r1");
    expect(link).toHaveTextContent("Schätzfragen läuft");
  });

  it("tells you your seat is open, with the primary emphasis", () => {
    renderBanner();
    deliver(running({ submitted: ["max"] }));
    expect(screen.getByText("Gib deinen Tipp ab!")).toBeInTheDocument();
    expect(screen.getByRole("link").className).toContain("ring-primary/50");
  });

  it("shows the progress once you have answered", () => {
    renderBanner();
    deliver(running({ submitted: ["lea", "max"] }));
    expect(screen.getByText("2 von 3 Tipps")).toBeInTheDocument();
    expect(screen.getByRole("link").className).not.toContain("ring-primary/50");
  });

  it("shows the progress to somebody who is not playing", () => {
    renderBanner(GROUP, "zed");
    deliver(running({ submitted: ["max"] }));
    expect(screen.getByText("1 von 3 Tipps")).toBeInTheDocument();
  });

  it("asks the absent players for their last chance, and everybody else just sees the progress", () => {
    const lastCall = {
      lastCallAt: NOW.toISOString(),
      closesAt: new Date(NOW.getTime() + 120_000).toISOString(),
      submitted: ["max"],
    };
    renderBanner();
    deliver(running(lastCall));
    expect(screen.getByText("Letzte Chance — jetzt tippen!")).toBeInTheDocument();
  });

  it("does not shout 'last chance' at somebody who has already answered", () => {
    renderBanner(GROUP, "max");
    deliver(
      running({
        lastCallAt: NOW.toISOString(),
        closesAt: new Date(NOW.getTime() + 120_000).toISOString(),
        submitted: ["max"],
      }),
    );
    expect(screen.queryByText("Letzte Chance — jetzt tippen!")).toBeNull();
    expect(screen.getByText("1 von 3 Tipps")).toBeInTheDocument();
  });

  it("says the time is up once the deadline plus grace has passed", () => {
    renderBanner();
    deliver(running({ closesAt: new Date(NOW.getTime() - 60_000).toISOString() }));
    expect(screen.getByText("Zeit abgelaufen — auswerten")).toBeInTheDocument();
  });

  it("notices the deadline passing on its own", () => {
    renderBanner();
    deliver(running({ closesAt: new Date(NOW.getTime() + 10_000).toISOString() }));
    expect(screen.getByText("Gib deinen Tipp ab!")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(20_000));
    expect(screen.getByText("Zeit abgelaufen — auswerten")).toBeInTheDocument();
  });

  it("announces a running Stechfrage", () => {
    const round = running({}, {});
    const stechen = makeStage(DEGREES_QUESTION, ["lea", "max"], null, {
      index: 1,
      kind: "stechen",
      closesAt: new Date(NOW.getTime() + 300_000).toISOString(),
      submitted: ["lea"],
    });
    const first = makeStage(
      RATIO_QUESTION,
      ["lea", "max", "ben"],
      makeReveal(RATIO_QUESTION, 100_000, [{ uid: "ben", guess: 1, fate: "contested" }], {
        next: "stechen",
      }),
    );
    renderBanner();
    deliver({ ...round, stages: [first, stechen] });
    expect(screen.getByText("Stechfrage läuft")).toBeInTheDocument();
  });

  it("renders a visible error with the code when the listener fails, never nothing", () => {
    renderBanner();
    act(() => h.listeners[h.listeners.length - 1].fail({ code: "permission-denied" }));
    expect(
      screen.getByText("Daten konnten nicht geladen werden. Lade die Seite neu."),
    ).toBeInTheDocument();
    expect(screen.getByText("Fehlercode: permission-denied")).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it("renders nothing for a stale pointer: the round is gone, finished or cancelled", () => {
    const { container } = renderBanner();
    deliver(null, false);
    expect(container).toBeEmptyDOMElement();
    deliver(running({}, { status: "finished" }));
    expect(container).toBeEmptyDOMElement();
    deliver(running({}, { status: "cancelled" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the banner when this device has no copy of the round (offline), instead of hiding a real round", () => {
    renderBanner();
    deliver(null, true);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/groups/g1/estimate/r1");
  });
});
