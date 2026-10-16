import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import type { GroupMember } from "@/lib/types";
import { type ReceiptDraft, ReceiptSplitDialog } from "./receipt-split-dialog";

function member(displayName: string): GroupMember {
  return { displayName, photoURL: "", joinedAt: "", role: "member", isPlaceholder: false };
}

const members = { anna: member("Anna"), ben: member("Ben"), carl: member("Carl") };

function renderEditor(initial: ReceiptDraft) {
  const onApply = vi.fn();
  render(
    <LocaleProvider initialLocale="de">
      <ReceiptSplitDialog
        open
        onOpenChange={vi.fn()}
        members={members}
        memberUids={Object.keys(members)}
        currency="EUR"
        initial={initial}
        onApply={onApply}
      />
    </LocaleProvider>,
  );
  return { onApply, user: userEvent.setup() };
}

/** The member toggles of one unit of one line: `unit(0, 2)` is the third Cola. */
function unitButtons(itemIndex: number, unitIndex: number) {
  const item = screen.getAllByTestId("receipt-item")[itemIndex];
  return {
    person: (name: string) => within(item).getAllByRole("button", { name })[unitIndex],
    item,
  };
}

describe("ReceiptSplitDialog", () => {
  it("assigns each unit, shares one, spreads the tip and hands back the exact split", async () => {
    const { onApply, user } = renderEditor({
      items: [
        { name: "Cola", quantity: 3, totalMinor: 1050 },
        { name: "Käsespätzle", quantity: 4, totalMinor: 3400 },
      ],
      totalMinor: 4450,
    });
    const apply = screen.getByRole("button", { name: "Übernehmen" });
    expect(apply).toBeDisabled();
    expect(screen.getByText("7 noch niemandem zugeordnet")).toBeInTheDocument();

    await user.click(unitButtons(0, 0).person("Anna"));
    await user.click(unitButtons(0, 1).person("Ben"));
    await user.click(unitButtons(0, 2).person("Carl"));

    // All four Spätzle to Anna, then the third to Ben and the fourth shared by Ben and Carl.
    await user.click(unitButtons(1, 0).person("Anna"));
    await user.click(
      within(unitButtons(1, 0).item).getByRole("button", { name: "Alle Einheiten wie die erste" }),
    );
    await user.click(unitButtons(1, 2).person("Anna"));
    await user.click(unitButtons(1, 2).person("Ben"));
    await user.click(unitButtons(1, 3).person("Anna"));
    await user.click(unitButtons(1, 3).person("Ben"));
    await user.click(unitButtons(1, 3).person("Carl"));
    expect(unitButtons(1, 3).person("Carl")).toHaveAttribute("aria-pressed", "true");

    const allocation = screen.getByTestId("receipt-allocation");
    expect(allocation).toHaveTextContent(/Anna\s*20,50/);
    expect(allocation).toHaveTextContent(/Ben\s*16,25/);
    expect(allocation).toHaveTextContent(/Carl\s*7,75/);

    const total = screen.getByLabelText("Gesamtbetrag laut Beleg");
    await user.clear(total);
    await user.type(total, "50");
    expect(screen.getByText(/Trinkgeld 5,50/)).toBeInTheDocument();

    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith({
      amountMinor: 5000,
      allocation: { anna: 2303, ben: 1826, carl: 871 },
      receipt: {
        items: [
          {
            name: "Cola",
            quantity: 3,
            totalMinor: 1050,
            units: [{ uids: ["anna"] }, { uids: ["ben"] }, { uids: ["carl"] }],
          },
          {
            name: "Käsespätzle",
            quantity: 4,
            totalMinor: 3400,
            units: [
              { uids: ["anna"] },
              { uids: ["anna"] },
              { uids: ["ben"] },
              { uids: ["ben", "carl"] },
            ],
          },
        ],
      },
    });
  });

  it("lets a misread line be corrected, removed or typed in from scratch", async () => {
    const { onApply, user } = renderEditor({
      items: [
        { name: "Co1a", quantity: 1, totalMinor: 35 },
        { name: "Summe", quantity: 1, totalMinor: 4450 },
      ],
      totalMinor: null,
    });

    // The model read 3,50 as 0,35 and took the sum line for an item.
    await user.click(
      within(unitButtons(1, 0).item).getByRole("button", { name: "Position entfernen" }),
    );
    expect(screen.getAllByTestId("receipt-item")).toHaveLength(1);
    const [name] = screen.getAllByLabelText("Position");
    await user.clear(name);
    await user.type(name, "Cola");
    const [price] = screen.getAllByLabelText("Preis gesamt");
    await user.clear(price);
    await user.type(price, "3,50");
    await user.click(unitButtons(0, 0).person("Ben"));

    await user.click(screen.getByRole("button", { name: "Position hinzufügen" }));
    const names = screen.getAllByLabelText("Position");
    await user.type(names[1], "Brezel");
    await user.type(screen.getAllByLabelText("Preis gesamt")[1], "2");
    // "Alle" shares the pretzel among the whole table.
    await user.click(unitButtons(1, 0).person("Alle"));

    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    // No total typed: the items' sum, 5,50. 2,00 among three: 67 + 67 + 66.
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 550, allocation: { ben: 417, anna: 67, carl: 66 } }),
    );
  });

  it("can't apply while a line has no price or the discount eats the bill", async () => {
    const { user } = renderEditor({
      items: [{ name: "Cola", quantity: 1, totalMinor: 350, units: [{ uids: ["anna"] }] }],
      totalMinor: null,
    });
    const apply = screen.getByRole("button", { name: "Übernehmen" });
    expect(apply).toBeEnabled();

    const total = screen.getByLabelText("Gesamtbetrag laut Beleg");
    await user.type(total, "0");
    expect(screen.getByText("Der Gesamtbetrag muss größer als 0 sein.")).toBeInTheDocument();
    expect(apply).toBeDisabled();

    await user.clear(total);
    await user.clear(screen.getByLabelText("Preis gesamt"));
    expect(apply).toBeDisabled();
  });
});
