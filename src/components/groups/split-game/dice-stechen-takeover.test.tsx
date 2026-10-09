import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import type { GroupMember } from "@/lib/types";
import { DiceStechenTakeover } from "./dice-stechen-takeover";

const member = (displayName: string): GroupMember => ({
  displayName,
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "member",
  isPlaceholder: false,
});
const members = { lea: member("Lea"), max: member("Max"), ben: member("Ben") };

function renderTakeover(props: Partial<React.ComponentProps<typeof DiceStechenTakeover>> = {}) {
  return render(
    <LocaleProvider initialLocale="de">
      <DiceStechenTakeover uids={["lea", "max"]} slots={1} members={members} {...props} />
    </LocaleProvider>,
  );
}

describe("DiceStechenTakeover", () => {
  it("keeps the dice game's own stamp and caption by default", () => {
    const { container } = renderTakeover();
    expect(container).toHaveTextContent("Stechen!");
    expect(container).toHaveTextContent("Lea gegen Max");
    expect(container).toHaveTextContent("Nur ihr würfelt nochmal — der kleinste Wurf zahlt.");
  });

  it("keeps the dice caption for several payers by default", () => {
    const { container } = renderTakeover({ uids: ["lea", "max", "ben"], slots: 2 });
    expect(container).toHaveTextContent("Nur ihr würfelt nochmal — die 2 kleinsten Würfe zahlen.");
  });

  it("lets another game override the stamp and the caption", () => {
    const { container } = renderTakeover({
      stamp: "Stechfrage!",
      caption: "Nur ihr tippt nochmal — wer weiter danebenliegt, zahlt.",
    });
    expect(container).toHaveTextContent("Stechfrage!");
    expect(container).toHaveTextContent("Nur ihr tippt nochmal — wer weiter danebenliegt, zahlt.");
    expect(screen.queryByText(/würfelt/)).toBeNull();
    expect(container).not.toHaveTextContent("Stechen!");
  });

  it("overrides each independently", () => {
    const stampOnly = renderTakeover({ stamp: "Stechfrage!" });
    expect(stampOnly.container).toHaveTextContent("Stechfrage!");
    expect(stampOnly.container).toHaveTextContent("Nur ihr würfelt nochmal");
    stampOnly.unmount();
    const captionOnly = renderTakeover({ caption: "Eigene Zeile" });
    expect(captionOnly.container).toHaveTextContent("Stechen!");
    expect(captionOnly.container).toHaveTextContent("Eigene Zeile");
  });

  it("stays decorative: aria-hidden, the caller announces the roll-off", () => {
    const { container } = renderTakeover();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
