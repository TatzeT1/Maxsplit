import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Next = (snapshot: unknown) => void;
type Fail = (error: { code: string }) => void;
interface Listener {
  path: string;
  next: Next;
  fail: Fail;
}

const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  user: { uid: "lea" } as { uid: string } | null,
  online: true,
  submit: vi.fn(),
  close: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path }),
  onSnapshot: (ref: { path: string[] }, _options: unknown, next: Next, fail: Fail) => {
    h.listeners.push({ path: ref.path.join("/"), next, fail });
    return () => {};
  },
}));
vi.mock("@/lib/firebase/client", () => ({ db: {}, auth: {} }));
vi.mock("@/lib/firebase/use-current-user", () => ({ useCurrentUser: () => h.user }));
vi.mock("@/lib/use-online", () => ({ useOnline: () => h.online }));
vi.mock("@/lib/actions/estimate-rounds", () => ({
  submitEstimateGuess: (...args: unknown[]) => h.submit(...args),
  closeEstimateStage: (...args: unknown[]) => h.close(...args),
  cancelEstimateRound: (...args: unknown[]) => h.cancel(...args),
}));

import { LocaleProvider } from "@/components/locale-provider";
import type { EstimateRound, EstimateStage, Group, GroupMember } from "@/lib/types";
import {
  EstimateRoundPageClient,
  estimatePageView,
  type SourceState,
} from "./estimate-round-page-client";
import {
  DEGREES_QUESTION,
  MEMBERS,
  RATIO_QUESTION,
  decidedRound,
  makeReveal,
  makeRound,
  makeStage,
  member,
} from "./split-game/estimate/estimate-test-data";

const NOW = new Date("2026-05-01T10:00:00.000Z");
const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const ENTRANTS = {
  lea: { displayName: "Lea", isPlaceholder: false },
  max: { displayName: "Max", isPlaceholder: false },
  ben: { displayName: "Ben", isPlaceholder: false },
};
const STAKE = { description: "Pizza", amountMinor: 3000, currency: "EUR" };

function group(members: Record<string, GroupMember> = MEMBERS): Group {
  return { id: "g1", name: "Runde", members, memberUids: Object.keys(members) } as unknown as Group;
}

function guessing(
  stage: Partial<EstimateStage> = {},
  round: Partial<EstimateRound> = {},
): EstimateRound {
  return makeRound(
    [
      makeStage(RATIO_QUESTION, ["lea", "max", "ben"], null, {
        closesAt: inMs(300_000),
        slots: 1,
        ...stage,
      }),
    ],
    {
      mode: "online",
      id: "r1",
      entrants: ENTRANTS,
      order: ["lea", "max", "ben"],
      answerWindowMs: 300_000,
      stake: STAKE,
      createdBy: "lea",
      ...round,
    },
  );
}

function finished(): EstimateRound {
  return {
    ...decidedRound(),
    id: "r1",
    mode: "online",
    stake: STAKE,
    expenseId: "e1",
    answerWindowMs: 300_000,
    createdBy: "lea",
  };
}

/** Stage 0 revealed with a Stechfrage following; stage 1 is guessing for lea and max. */
function stechenRound(): EstimateRound {
  const reveal = makeReveal(
    DEGREES_QUESTION,
    100_000,
    [
      { uid: "max", guess: 111_000, fate: "contested" },
      { uid: "lea", guess: 90_000, fate: "contested" },
      { uid: "ben", guess: 100_000, fate: "safe" },
    ],
    { slotsLeft: 1, next: "stechen", bandTie: true, tolerance: { kind: "interval", milli: 1000 } },
  );
  const first = makeStage(DEGREES_QUESTION, ["lea", "max", "ben"], reveal);
  const second = makeStage(RATIO_QUESTION, ["lea", "max"], null, {
    index: 1,
    kind: "stechen",
    slots: 1,
    closesAt: inMs(300_000),
  });
  return { ...guessing(), stages: [first, second] };
}

function push(
  source: "group" | "round",
  data: object | null,
  options: { fromCache?: boolean } = {},
) {
  const path = source === "group" ? "groups/g1" : "groups/g1/estimateRounds/r1";
  const matching = h.listeners.filter((listener) => listener.path === path);
  const listener = matching[matching.length - 1];
  act(() =>
    listener.next({
      id: source === "group" ? "g1" : "r1",
      exists: () => data !== null,
      data: () => data,
      metadata: { fromCache: options.fromCache ?? false },
    }),
  );
}

function pushAll(round: EstimateRound | null, g: Group | null = group()) {
  push("group", g);
  push("round", round);
}

function fail(source: "group" | "round", code: string) {
  const path = source === "group" ? "groups/g1" : "groups/g1/estimateRounds/r1";
  const matching = h.listeners.filter((listener) => listener.path === path);
  act(() => matching[matching.length - 1].fail({ code }));
}

function renderPage() {
  return render(
    <LocaleProvider initialLocale="de">
      <EstimateRoundPageClient groupId="g1" roundId="r1" />
    </LocaleProvider>,
  );
}

const field = () => screen.getByRole("textbox");
const NEEDS_CONNECTION = "Diese Runde braucht eine Verbindung.";
const skeletons = (container: HTMLElement) => container.querySelectorAll('[data-slot="skeleton"]');
const backLink = () => screen.getAllByRole("link", { name: "Zurück" })[0];

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("EstimateRoundPageClient", () => {
  beforeEach(() => {
    h.listeners.length = 0;
    h.user = { uid: "lea" };
    h.online = true;
    h.submit.mockReset();
    h.close.mockReset();
    h.cancel.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("the state table (G.7), one test per row", () => {
    it("1: signed out or auth pending is a skeleton, with no listener", () => {
      h.user = null;
      const { container } = renderPage();
      expect(skeletons(container).length).toBeGreaterThan(0);
      expect(h.listeners).toHaveLength(0);
    });

    it("2: offline is NeedsConnection for any state — and never a stage", () => {
      const { container, rerender } = renderPage();
      pushAll(guessing());
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      h.online = false;
      rerender(
        <LocaleProvider initialLocale="de">
          <EstimateRoundPageClient groupId="g1" roundId="r1" />
        </LocaleProvider>,
      );
      expect(screen.getByText(new RegExp(NEEDS_CONNECTION))).toBeInTheDocument();
      expect(screen.getByText(/Die Zeit läuft weiter/)).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(skeletons(container)).toHaveLength(0);
    });

    it("2: offline before anything arrived is NeedsConnection too, not a skeleton", () => {
      h.online = false;
      const { container } = renderPage();
      expect(screen.getByText(new RegExp(NEEDS_CONNECTION))).toBeInTheDocument();
      expect(skeletons(container)).toHaveLength(0);
    });

    it("3: a listener error shows the code, reports it, and is not a skeleton", () => {
      const { container } = renderPage();
      fail("round", "permission-denied");
      expect(
        screen.getByText("Daten konnten nicht geladen werden. Lade die Seite neu."),
      ).toBeInTheDocument();
      expect(screen.getByText("Fehlercode: permission-denied")).toBeInTheDocument();
      expect(skeletons(container)).toHaveLength(0);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("estimate-round listener failed: permission-denied"),
        expect.anything(),
      );
      expect(backLink()).toHaveAttribute("href", "/groups/g1");
    });

    it("3: a group listener error is shown the same way, even when the round arrived", () => {
      const { container } = renderPage();
      push("round", guessing());
      fail("group", "unavailable");
      expect(screen.getByText("Fehlercode: unavailable")).toBeInTheDocument();
      expect(skeletons(container)).toHaveLength(0);
    });

    it("4: an empty cache while 'online' is NeedsConnection — not 'not found' and not a skeleton", () => {
      const { container } = renderPage();
      push("group", group());
      push("round", null, { fromCache: true });
      expect(screen.getByText(new RegExp(NEEDS_CONNECTION))).toBeInTheDocument();
      expect(screen.queryByText("Diese Runde gibt es nicht.")).toBeNull();
      expect(skeletons(container)).toHaveLength(0);
    });

    it("4: an empty group cache is NeedsConnection too", () => {
      renderPage();
      push("group", null, { fromCache: true });
      push("round", guessing());
      expect(screen.getByText(new RegExp(NEEDS_CONNECTION))).toBeInTheDocument();
    });

    it("5: only a server answer makes the round 'not found', with a way back", () => {
      renderPage();
      push("group", group());
      push("round", null, { fromCache: false });
      expect(screen.getByText("Diese Runde gibt es nicht.")).toBeInTheDocument();
      expect(backLink()).toHaveAttribute("href", "/groups/g1");
    });

    it("6: loading is a skeleton only while a source has not delivered, and says so by a way out", () => {
      const { container } = renderPage();
      expect(skeletons(container).length).toBeGreaterThan(0);
      push("group", group());
      expect(skeletons(container).length).toBeGreaterThan(0);
      expect(backLink()).toHaveAttribute("href", "/groups/g1");
      push("round", guessing());
      expect(skeletons(container)).toHaveLength(0);
    });

    it("7: my open seat shows the guess frame, then the countdown, then the seats", () => {
      renderPage();
      pushAll(guessing({ submitted: ["max"] }));
      const frame = document.querySelector('[data-slot="estimate-guess-frame"]') as HTMLElement;
      expect(frame).not.toBeNull();
      expect(field()).toHaveAccessibleName("Dein Tipp — in Meter");
      expect(within(frame).getByRole("button", { name: "Tipp sperren" })).toBeDisabled();
      const countdown = screen.getByRole("timer");
      const seats = document.querySelector('[data-slot="estimate-seats"]') as HTMLElement;
      expect(
        frame.compareDocumentPosition(countdown) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        countdown.compareDocumentPosition(seats) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(countdown).toHaveTextContent("Noch 5:00");
      expect(screen.getByText("Pizza", { exact: false })).toBeInTheDocument();
      expect(backLink()).toHaveAttribute("href", "/groups/g1");
    });

    it("8: after my lock the page waits, names no number, and has no field", () => {
      renderPage();
      pushAll(guessing({ submitted: ["lea", "max"] }));
      expect(screen.getByText(/Dein Tipp ist gesperrt/)).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByText("2 von 3 haben getippt")).toBeInTheDocument();
      // No grouped number such as 2.962 anywhere: the page never learns a value.
      expect(document.body.textContent).not.toMatch(/\d\.\d{3}/);
    });

    it("9: somebody who is not a contender watches", () => {
      h.user = { uid: "tom" };
      renderPage();
      pushAll(guessing());
      expect(screen.getByText("Du spielst nicht mit — schau zu.")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(document.querySelector('[data-slot="estimate-seats"]')).not.toBeNull();
      expect(backLink()).toHaveAttribute("href", "/groups/g1");
    });

    it("9: a player who is out of a Stechfrage watches it", () => {
      h.user = { uid: "ben" };
      renderPage();
      pushAll(stechenRound());
      expect(screen.getByText("Du spielst nicht mit — schau zu.")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("10: a running last call is labelled, and an absent player gets the frame again", () => {
      renderPage();
      pushAll(guessing({ lastCallAt: inMs(-1000), closesAt: inMs(118_000), submitted: ["max"] }));
      expect(screen.getByRole("timer")).toHaveTextContent("Letzte Chance läuft — noch 1:58.");
      expect(field()).toBeInTheDocument();
    });

    it("11: after the deadline the close button names who is absent and what it costs", () => {
      renderPage();
      pushAll(guessing({ closesAt: inMs(-10_000), submitted: ["max"] }));
      expect(screen.getByText("Die Zeit ist um.")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Letzte Chance senden" }));
      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText("Letzte Chance einläuten?")).toBeInTheDocument();
      expect(dialog).toHaveTextContent("Noch ohne Tipp: Lea und Ben.");
      expect(dialog).toHaveTextContent("2 Minuten");
      // Two absent, one payer: the lot decides, up to the whole bill.
      expect(dialog).toHaveTextContent(/Das Los entscheidet, wer von Lea und Ben zahlt — bis zu/);
      expect(dialog).toHaveTextContent("30,00");
    });

    it("11: with fewer absent players than payers they simply pay", () => {
      renderPage();
      pushAll(
        guessing(
          { closesAt: inMs(-10_000), submitted: ["max", "ben"], slots: 2 },
          {
            targetLoserCount: 2,
          },
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: "Letzte Chance senden" }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent(/Lea zahlen bis zu 15,00/);
    });

    it("11: 'Jetzt auswerten' follows the last call, behind its own confirmation", async () => {
      h.close.mockResolvedValue({ ok: true, data: { closed: true } });
      renderPage();
      pushAll(
        guessing({
          closesAt: inMs(-10_000),
          lastCallAt: inMs(-130_000),
          submitted: ["max", "ben"],
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Jetzt auswerten" }));
      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText("Jetzt auswerten?")).toBeInTheDocument();
      expect(dialog).toHaveTextContent("Ohne Tipp: Lea.");
      fireEvent.click(within(dialog).getByRole("button", { name: "Jetzt auswerten" }));
      await flush();
      expect(h.close).toHaveBeenCalledWith({ groupId: "g1", roundId: "r1", stageIndex: 0 });
    });

    it("11: starting the last call answers {closed:false} with a visible note", async () => {
      h.close.mockResolvedValue({ ok: true, data: { closed: false } });
      renderPage();
      pushAll(guessing({ closesAt: inMs(-10_000), submitted: ["max"] }));
      fireEvent.click(screen.getByRole("button", { name: "Letzte Chance senden" }));
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Letzte Chance senden",
        }),
      );
      await flush();
      expect(
        screen.getByText(/Letzte Chance gesendet\. Wer noch fehlt, hat jetzt 2 Minuten/),
      ).toBeInTheDocument();
    });

    it("11: a time-not-up answer says the last call is running, never a spinner", async () => {
      h.close.mockResolvedValue({ ok: false, error: "time-not-up" });
      renderPage();
      pushAll(
        guessing({
          closesAt: inMs(-10_000),
          lastCallAt: inMs(-130_000),
          submitted: ["max", "ben"],
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Jetzt auswerten" }));
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", { name: "Jetzt auswerten" }),
      );
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/Letzte Chance läuft — noch \d+:\d\d\./);
    });

    it("11: only entrants, the creator and managers may close; a plain member just sees the time is up", () => {
      h.user = { uid: "tom" };
      renderPage();
      pushAll(guessing({ closesAt: inMs(-10_000), submitted: ["max"] }));
      expect(screen.getByText("Die Zeit ist um.")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Letzte Chance senden|Jetzt auswerten/ }),
      ).toBeNull();
    });

    it("11: a manager who is not playing may close", () => {
      h.user = { uid: "tom" };
      renderPage();
      pushAll(
        guessing({ closesAt: inMs(-10_000), submitted: ["max"] }),
        group({ ...MEMBERS, tom: { ...member("Tom"), role: "admin" } }),
      );
      expect(screen.getByRole("button", { name: "Letzte Chance senden" })).toBeInTheDocument();
    });

    it("11: nobody can close before the deadline", () => {
      renderPage();
      pushAll(guessing({ closesAt: inMs(60_000), submitted: ["max"] }));
      expect(
        screen.queryByRole("button", { name: /Letzte Chance senden|Jetzt auswerten/ }),
      ).toBeNull();
      expect(screen.queryByText("Die Zeit ist um.")).toBeNull();
    });

    it("11: the deadline arriving turns the countdown into the close button by itself", () => {
      renderPage();
      pushAll(guessing({ closesAt: inMs(2000), submitted: ["max"] }));
      expect(screen.queryByRole("button", { name: "Letzte Chance senden" })).toBeNull();
      act(() => void vi.advanceTimersByTime(8000));
      expect(screen.getByRole("button", { name: "Letzte Chance senden" })).toBeInTheDocument();
    });

    it("12: a Stechfrage shows the revealed stage as history and the frame for a contender", () => {
      renderPage();
      pushAll(stechenRound());
      const history = document.querySelector('[data-slot="estimate-history"]') as HTMLElement;
      expect(history).not.toBeNull();
      expect(within(history).getByText("Die Frage")).toBeInTheDocument();
      expect(
        history.querySelector('[data-slot="estimate-reveal"]')?.getAttribute("data-animated"),
      ).toBe("false");
      expect(field()).toBeInTheDocument();
      expect(screen.getByText("Stechfrage 1")).toBeInTheDocument();
    });

    it("13: a finished round opened later shows the result at once, booked, with a way back", () => {
      renderPage();
      pushAll(finished());
      const reveal = document.querySelector('[data-slot="estimate-reveal"]') as HTMLElement;
      expect(reveal.getAttribute("data-animated")).toBe("false");
      expect(screen.getByText("Ausgabe automatisch eingetragen")).toBeInTheDocument();
      expect(backLink()).toHaveAttribute("href", "/groups/g1");
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("13: a failed booking is a visible alert", () => {
      renderPage();
      pushAll({ ...finished(), expenseId: null, autoBookError: "member-left" });
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("13: a guessing -> revealed transition seen in this mount animates the reveal", () => {
      renderPage();
      pushAll(guessing({ submitted: ["lea", "max"] }));
      expect(document.querySelector('[data-slot="estimate-reveal"]')).toBeNull();
      push("round", finished());
      const reveal = document.querySelector('[data-slot="estimate-reveal"]') as HTMLElement;
      expect(reveal.getAttribute("data-animated")).toBe("true");
    });

    it("14: a cancelled round says so, with a way back", () => {
      renderPage();
      pushAll(guessing({}, { status: "cancelled" }));
      expect(
        screen.getByText("Diese Runde wurde abgebrochen — es wurde nichts eingetragen."),
      ).toBeInTheDocument();
      expect(backLink()).toHaveAttribute("href", "/groups/g1");
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });

  describe("locking a guess", () => {
    function type(value: string) {
      fireEvent.change(field(), { target: { value } });
    }
    const lockButton = () => screen.getByRole("button", { name: "Tipp sperren" });

    it("calls submitEstimateGuess with the milli value, then shows the lock", async () => {
      h.submit.mockResolvedValue({ ok: true, data: { stageClosed: false } });
      renderPage();
      pushAll(guessing());
      type("1000");
      fireEvent.click(lockButton());
      await flush();
      expect(h.submit).toHaveBeenCalledWith({
        groupId: "g1",
        roundId: "r1",
        stageIndex: 0,
        guessMilli: 1_000_000,
      });
      expect(screen.getByText("Tipp gesperrt")).toBeInTheDocument();
      expect(screen.getByText(/Dein Tipp ist gesperrt/)).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
      // The number is nowhere on the page after the lock.
      expect(document.body.textContent).not.toContain("1.000");
    });

    it.each([
      ["stage-closed", "Die Zeit zum Tippen ist vorbei."],
      ["stale-stage", "Die Runde ist schon weiter — die Seite aktualisiert sich."],
      ["not-a-contender", "Du spielst nicht mit — schau zu."],
      ["network", "nichts gespeichert"],
      ["guess-below-min", "Mindestens"],
      ["guess-above-max", "Höchstens"],
      ["guess-zero", "Null gibt es bei dieser Frage nicht."],
      ["something-else", "Der Tipp konnte nicht gespeichert werden."],
    ])("maps %s to a visible message and keeps the field", async (code, text) => {
      h.submit.mockResolvedValue({ ok: false, error: code });
      renderPage();
      pushAll(guessing());
      type("1000");
      fireEvent.click(lockButton());
      await flush();
      const alerts = screen.getAllByRole("alert").map((node) => node.textContent ?? "");
      expect(alerts.some((alert) => alert.includes(text))).toBe(true);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("maps time-not-up during a last call to the last-call message", async () => {
      h.submit.mockResolvedValue({ ok: false, error: "time-not-up" });
      renderPage();
      pushAll(guessing({ lastCallAt: inMs(-1000), closesAt: inMs(60_000) }));
      type("1000");
      fireEvent.click(lockButton());
      await flush();
      expect(document.body.textContent).toMatch(/Letzte Chance läuft — noch \d+:\d\d\./);
    });

    it("maps time-not-up without a last call to 'the time is still running'", async () => {
      h.submit.mockResolvedValue({ ok: false, error: "time-not-up" });
      renderPage();
      pushAll(guessing());
      type("1000");
      fireEvent.click(lockButton());
      await flush();
      expect(document.body.textContent).toContain("Die Zeit zum Tippen läuft noch.");
    });

    it("a rejected call becomes a visible error, never a spinner that never stops", async () => {
      h.submit.mockRejectedValue(new Error("offline"));
      renderPage();
      pushAll(guessing());
      type("1000");
      fireEvent.click(lockButton());
      await flush();
      expect(h.submit).toHaveBeenCalledTimes(1);
      const alerts = screen.getAllByRole("alert").map((node) => node.textContent ?? "");
      expect(alerts.some((alert) => alert.includes("nichts gespeichert"))).toBe(true);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(lockButton()).toBeDisabled();
      type("1000");
      expect(lockButton()).toBeEnabled();
    });
  });

  describe("creator extras", () => {
    it("shows the invite card and the cancel button while nobody has guessed", async () => {
      h.cancel.mockResolvedValue({ ok: true, data: null });
      renderPage();
      pushAll(guessing());
      expect(document.querySelector('[data-slot="estimate-invite-card"]')).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Runde abbrechen" }));
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent("Runde wirklich abbrechen?");
      fireEvent.click(within(dialog).getByRole("button", { name: "Runde abbrechen" }));
      await flush();
      expect(h.cancel).toHaveBeenCalledWith({ groupId: "g1", roundId: "r1" });
    });

    it("hides both once somebody has locked a guess", () => {
      renderPage();
      pushAll(guessing({ submitted: ["max"] }));
      expect(document.querySelector('[data-slot="estimate-invite-card"]')).toBeNull();
      expect(screen.queryByRole("button", { name: "Runde abbrechen" })).toBeNull();
    });

    it("gives the cancel button to a manager but the invite only to the creator", () => {
      h.user = { uid: "tom" };
      renderPage();
      pushAll(guessing(), group({ ...MEMBERS, tom: { ...member("Tom"), role: "owner" } }));
      expect(screen.getByRole("button", { name: "Runde abbrechen" })).toBeInTheDocument();
      expect(document.querySelector('[data-slot="estimate-invite-card"]')).toBeNull();
    });

    it("offers neither to somebody else", () => {
      h.user = { uid: "max" };
      renderPage();
      pushAll(guessing());
      expect(screen.queryByRole("button", { name: "Runde abbrechen" })).toBeNull();
      expect(document.querySelector('[data-slot="estimate-invite-card"]')).toBeNull();
    });
  });

  describe("live announcements", () => {
    const status = () =>
      Array.from(document.querySelectorAll('p[role="status"].sr-only')).map((node) =>
        (node.textContent ?? "").replaceAll("\u00a0", " "),
      );

    it("announces who has locked, by count and name, and never a value", () => {
      renderPage();
      pushAll(guessing());
      expect(status().join("")).toBe("");
      push("round", guessing({ submitted: ["max"] }));
      expect(status().join(" ")).toContain("Max hat getippt. 1 von 3 haben getippt.");
      push("round", guessing({ submitted: ["max", "ben"] }));
      expect(status().join(" ")).toContain("Ben hat getippt. 2 von 3 haben getippt.");
      expect(status().join(" ")).not.toMatch(/\d{4}/);
    });

    it("announces the truth at the reveal, without repeating the payers", () => {
      renderPage();
      pushAll(guessing({ submitted: ["lea", "max"] }));
      push("round", finished());
      expect(status().join(" ")).toContain("Auflösung: richtig ist 2.962 m.");
    });

    it("announces a Stechfrage with its contenders", () => {
      renderPage();
      pushAll(guessing({ submitted: ["lea", "max"] }));
      push("round", stechenRound());
      expect(status().join(" ")).toContain("Gleichstand. Stechfrage für Lea und Max.");
    });

    it("announces nothing for what was already on screen when the page opened", () => {
      renderPage();
      pushAll(finished());
      expect(status().join("")).toBe("");
    });
  });
});

describe("estimatePageView: every combination maps to exactly one row", () => {
  const sources: SourceState[] = [];
  for (const received of [false, true]) {
    for (const cachedEmpty of [false, true]) {
      for (const missing of [false, true]) {
        for (const hasData of [false, true]) {
          for (const errorCode of [null, "unavailable"]) {
            sources.push({ received, cachedEmpty, missing, hasData, errorCode });
          }
        }
      }
    }
  }
  const KINDS = ["auth", "offline", "error", "no-copy", "not-found", "loading", "ready"];

  it("is total, and 'loading' only ever means a source that has not delivered", () => {
    let combos = 0;
    for (const signedIn of [false, true]) {
      for (const online of [false, true]) {
        for (const group of sources) {
          for (const round of sources) {
            combos += 1;
            const view = estimatePageView({ signedIn, online, group, round });
            expect(KINDS).toContain(view.kind);
            if (view.kind === "loading") {
              expect(signedIn && online).toBe(true);
              expect(group.errorCode ?? round.errorCode).toBeNull();
              expect(!group.received || !round.received).toBe(true);
              expect(group.cachedEmpty || round.cachedEmpty).toBe(false);
              expect(group.missing || round.missing).toBe(false);
            }
            if (view.kind === "ready") {
              expect(signedIn && online).toBe(true);
              expect(group.received && round.received && group.hasData && round.hasData).toBe(true);
              expect(group.errorCode ?? round.errorCode).toBeNull();
            }
            if (view.kind === "error" && (group.errorCode ?? round.errorCode) === null) {
              // A "received" snapshot that carries nothing is a failure, not a wait.
              expect(view.code).toBe("empty-snapshot");
            }
            // First match wins, in the table's order.
            if (!signedIn) expect(view.kind).toBe("auth");
            else if (!online) expect(view.kind).toBe("offline");
            else if (group.errorCode ?? round.errorCode) expect(view.kind).toBe("error");
            else if (group.cachedEmpty || round.cachedEmpty) expect(view.kind).toBe("no-copy");
            else if (group.missing || round.missing) expect(view.kind).toBe("not-found");
          }
        }
      }
    }
    expect(combos).toBe(2 * 2 * 32 * 32);
  });
});
