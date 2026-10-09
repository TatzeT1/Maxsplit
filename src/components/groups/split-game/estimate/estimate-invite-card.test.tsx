import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { EstimateInviteCard } from "./estimate-invite-card";
import { MEMBERS, RATIO_QUESTION, makeRound, makeStage } from "./estimate-test-data";

function card(overrides: Parameters<typeof makeRound>[1] = {}, currentUid = "lea") {
  const round = makeRound([makeStage(RATIO_QUESTION, ["lea", "max", "ben"], null)], {
    mode: "online",
    id: "r1",
    order: ["lea", "max", "ben"],
    entrants: {
      lea: { displayName: "Lea", isPlaceholder: false },
      max: { displayName: "Max", isPlaceholder: false },
      ben: { displayName: "Ben", isPlaceholder: false },
    },
    stake: { description: "Pizza", amountMinor: 3000, currency: "EUR" },
    ...overrides,
  });
  return render(
    <LocaleProvider initialLocale="de">
      <EstimateInviteCard
        groupId="g1"
        round={round}
        members={MEMBERS}
        currentUid={currentUid}
        gameTitle="Schätzfragen"
      />
    </LocaleProvider>,
  );
}

describe("EstimateInviteCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives the creator a WhatsApp link carrying the play URL, the game and the stake", () => {
    card();
    const link = screen.getByRole("link", { name: /WhatsApp/ });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(href.replace("https://wa.me/?text=", ""));
    expect(text).toContain(`${window.location.origin}/play/g1/estimate/r1`);
    expect(text).toContain("Schätzfragen");
    expect(text).toContain("Pizza");
    expect(text).toContain("Lea");
  });

  it("copies the play URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    card();
    fireEvent.click(screen.getByRole("button", { name: "Link kopieren" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/play/g1/estimate/r1`),
    );
    expect(await screen.findByText("Link kopiert!")).toBeInTheDocument();
  });

  it("names the one other player, or the group for several", () => {
    card({
      entrants: {
        lea: { displayName: "Lea", isPlaceholder: false },
        max: { displayName: "Max", isPlaceholder: false },
      },
    });
    expect(screen.getByRole("heading", { name: "Sag Max Bescheid" })).toBeInTheDocument();
  });

  it("renders for the creator only", () => {
    const { container } = card({}, "max");
    expect(container).toBeEmptyDOMElement();
  });
});
