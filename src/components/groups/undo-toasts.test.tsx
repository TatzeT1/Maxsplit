import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import type { ActionResult } from "@/lib/actions/groups";
import { UNDO_VISIBLE_MS, UndoToasts, useUndoOffers } from "./undo-toasts";

// The "Rückgängig" toasts after a deletion: how long they stay, what a failed
// undo says, and that they can't be tapped while there's nothing to send to.

type Undo = () => Promise<ActionResult<unknown>>;

function Harness({ messages, undo }: { messages: string[]; undo: Undo }) {
  const { offers, offer, dismiss } = useUndoOffers();
  return (
    <>
      <button type="button" onClick={() => messages.forEach((message) => offer({ message, undo }))}>
        delete
      </button>
      <UndoToasts offers={offers} onDismiss={dismiss} />
    </>
  );
}

function renderToasts(undo: Undo, messages = ["„Pizza“ gelöscht"]) {
  render(
    <LocaleProvider initialLocale="de">
      <Harness messages={messages} undo={undo} />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "delete" }));
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

const ok: Undo = async () => ({ ok: true, data: null });

describe("UndoToasts", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  it("keeps an empty live region mounted, so the first toast gets announced", () => {
    render(
      <LocaleProvider initialLocale="de">
        <UndoToasts offers={[]} onDismiss={vi.fn()} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("runs the undo and takes the toast away once it worked", async () => {
    const undo = vi.fn(ok);
    renderToasts(undo);

    expect(screen.getByText("„Pizza“ gelöscht")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

    await waitFor(() => expect(screen.queryByText("„Pizza“ gelöscht")).not.toBeInTheDocument());
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("can't be tapped twice while the undo is on its way", async () => {
    let finish: (result: ActionResult<unknown>) => void = () => {};
    const undo = vi.fn<Undo>(() => new Promise((resolve) => (finish = resolve)));
    renderToasts(undo);

    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(screen.getByRole("button", { name: "Rückgängig" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(undo).toHaveBeenCalledTimes(1);

    await act(async () => finish({ ok: true, data: null }));
  });

  it.each([
    ["member-gone", "Jemand daraus ist nicht mehr in der Gruppe"],
    ["invalid-currency", "Die Währung der Gruppe hat sich geändert"],
    ["not-owner", "Das darfst du nicht wiederherstellen."],
    ["something-else", "Das ließ sich nicht wiederherstellen."],
  ])("says why a refused undo (%s) didn't work, instead of vanishing", async (error, text) => {
    renderToasts(async () => ({ ok: false, error }));

    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByText("„Pizza“ gelöscht")).not.toBeInTheDocument();
  });

  it("turns a request that never arrived into the not-saved message, not a stuck toast", async () => {
    renderToasts(async () => {
      throw new Error("offline");
    });

    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

    expect(await screen.findByText(/nichts gespeichert/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rückgängig" })).toBeEnabled();
  });

  it("disappears by itself after a few seconds", () => {
    vi.useFakeTimers();
    renderToasts(ok);

    act(() => vi.advanceTimersByTime(UNDO_VISIBLE_MS - 1));
    expect(screen.getByText("„Pizza“ gelöscht")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("„Pizza“ gelöscht")).not.toBeInTheDocument();
  });

  it("waits while the pointer is on it, so the button can't slip away mid-reach", () => {
    vi.useFakeTimers();
    renderToasts(ok);
    const toast = screen.getByText("„Pizza“ gelöscht").parentElement as HTMLElement;

    fireEvent.pointerEnter(toast);
    act(() => vi.advanceTimersByTime(UNDO_VISIBLE_MS * 3));
    expect(screen.getByText("„Pizza“ gelöscht")).toBeInTheDocument();

    fireEvent.pointerLeave(toast);
    act(() => vi.advanceTimersByTime(UNDO_VISIBLE_MS));
    expect(screen.queryByText("„Pizza“ gelöscht")).not.toBeInTheDocument();
  });

  it("can be dismissed with the close button", () => {
    renderToasts(ok);

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(screen.queryByText("„Pizza“ gelöscht")).not.toBeInTheDocument();
  });

  it("disables the undo offline — restoring is a Server Action with nothing to queue it", () => {
    setOnline(false);
    renderToasts(ok);

    expect(screen.getByRole("button", { name: "Rückgängig" })).toBeDisabled();
  });

  it("stacks a burst of deletions, but only keeps the newest three", () => {
    renderToasts(ok, ["eins", "zwei", "drei", "vier"]);

    expect(screen.queryByText("eins")).not.toBeInTheDocument();
    for (const message of ["zwei", "drei", "vier"]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
  });
});
