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
  it("starts with everyone sharing everything — a flat's shopping is bookable at once", async () => {
    const { onApply, user } = renderEditor({
      items: [
        { name: "Milch", quantity: 1, totalMinor: 120 },
        { name: "Joghurt", quantity: 6, totalMinor: 300 },
      ],
      totalMinor: null,
    });
    expect(screen.queryByText(/niemandem zugeordnet/)).not.toBeInTheDocument();
    // One row of names per line, however many units it has.
    expect(within(unitButtons(1, 0).item).getAllByRole("button", { name: "Anna" })).toHaveLength(1);
    expect(unitButtons(1, 0).person("Carl")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 420, allocation: { anna: 140, ben: 140, carl: 140 } }),
    );
  });

  it("takes one tap for 'only hers', then splits single units of a line", async () => {
    const { onApply, user } = renderEditor({
      items: [
        { name: "Milch", quantity: 1, totalMinor: 120 },
        { name: "Joghurt", quantity: 6, totalMinor: 300 },
        { name: "Bier", quantity: 3, totalMinor: 450 },
      ],
      totalMinor: null,
    });

    // Anna bought the beer for herself: from "everyone", a tap means "only Anna" — all three.
    await user.click(unitButtons(2, 0).person("Anna"));
    expect(unitButtons(2, 0).person("Anna")).toHaveAttribute("aria-pressed", "true");
    expect(unitButtons(2, 0).person("Ben")).toHaveAttribute("aria-pressed", "false");

    // Two of the six yoghurts were Ben's, the last one he shared with Carl.
    const yoghurt = unitButtons(1, 0).item;
    await user.click(within(yoghurt).getByRole("button", { name: "Stückweise aufteilen" }));
    expect(within(yoghurt).getAllByRole("button", { name: "Anna" })).toHaveLength(6);
    await user.click(unitButtons(1, 4).person("Ben"));
    await user.click(unitButtons(1, 5).person("Ben"));
    await user.click(unitButtons(1, 5).person("Carl"));

    // Milk 40 each. Yoghurt (3,00) by how much each had: four shared by three (4/3 each),
    // one Ben's, one Ben's and Carl's → Anna 4/3, Ben 17/6, Carl 11/6 of 6 units: 66,67 /
    // 141,67 / 91,67 cents, rounded once for the whole line (the odd cents by largest remainder).
    const allocation = screen.getByTestId("receipt-allocation");
    expect(allocation).toHaveTextContent(/Anna\s*5,57/);
    expect(allocation).toHaveTextContent(/Ben\s*1,81/);
    expect(allocation).toHaveTextContent(/Carl\s*1,32/);

    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    const everyone = { uids: ["anna", "ben", "carl"] };
    expect(onApply).toHaveBeenCalledWith({
      amountMinor: 870,
      allocation: { anna: 557, ben: 181, carl: 132 },
      receipt: {
        items: [
          { name: "Milch", quantity: 1, totalMinor: 120, units: [everyone] },
          {
            name: "Joghurt",
            quantity: 6,
            totalMinor: 300,
            units: [
              everyone,
              everyone,
              everyone,
              everyone,
              { uids: ["ben"] },
              { uids: ["ben", "carl"] },
            ],
          },
          {
            name: "Bier",
            quantity: 3,
            totalMinor: 450,
            units: [{ uids: ["anna"] }, { uids: ["anna"] }, { uids: ["anna"] }],
          },
        ],
      },
    });
  });

  it("brings everyone back with 'Alle', and folds a split line back into one row", async () => {
    const { user } = renderEditor({
      items: [{ name: "Joghurt", quantity: 2, totalMinor: 100 }],
      totalMinor: null,
    });
    await user.click(unitButtons(0, 0).person("Ben"));
    // Taking the last name off leaves the line with nobody — said so, and not bookable.
    await user.click(unitButtons(0, 0).person("Ben"));
    expect(screen.getByText("2 noch niemandem zugeordnet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
    await user.click(unitButtons(0, 0).person("Alle"));
    expect(screen.getByTestId("receipt-allocation")).toHaveTextContent(/Anna\s*0,34/);

    const item = unitButtons(0, 0).item;
    await user.click(within(item).getByRole("button", { name: "Stückweise aufteilen" }));
    await user.click(unitButtons(0, 1).person("Carl"));
    await user.click(within(item).getByRole("button", { name: "Alle Stück gleich aufteilen" }));
    // Every unit takes the first one's people again: everyone.
    expect(within(item).getAllByRole("button", { name: "Carl" })).toHaveLength(1);
    expect(screen.getByTestId("receipt-allocation")).toHaveTextContent(/Carl\s*0,33/);
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
    // A new line is shared by the whole table, like a scanned one.
    await user.type(screen.getAllByLabelText("Preis gesamt")[1], "2");

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

  it("keeps what the scan said each line is, and lets it be corrected", async () => {
    const { onApply, user } = renderEditor({
      items: [
        {
          name: "Schweinemett",
          quantity: 1,
          totalMinor: 320,
          product: { family: "meat", kind: "Mett" },
        },
        { name: "Brot", quantity: 1, totalMinor: 250, product: null },
      ],
      totalMinor: null,
    });
    const [mett, bread] = screen.getAllByTestId("receipt-item");
    expect(within(mett).getByRole("button", { name: /Mett/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // No class yet: it says what happens, rather than looking empty.
    const pending = within(bread).getByRole("button", { name: /nach dem Speichern eingeordnet/ });

    // The model called it Mett; it was Hackfleisch.
    await user.click(within(mett).getByRole("button", { name: /Mett/ }));
    const kind = within(mett).getByLabelText("Produktart");
    await user.clear(kind);
    await user.type(kind, "hackfleisch");

    await user.click(pending);
    await user.selectOptions(within(bread).getByLabelText("Obergruppe"), "bakery");
    await user.type(within(bread).getByLabelText("Produktart"), "Brot");

    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    const { receipt } = onApply.mock.calls[0][0];
    expect(receipt.items.map((item: { product?: unknown }) => item.product)).toEqual([
      { family: "meat", kind: "Hackfleisch" },
      { family: "bakery", kind: "Brot" },
    ]);
  });

  it("leaves a line without a class for the server when nothing is set", async () => {
    const { onApply, user } = renderEditor({
      items: [{ name: "Brot", quantity: 1, totalMinor: 250 }],
      totalMinor: null,
    });
    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onApply.mock.calls[0][0].receipt.items[0]).not.toHaveProperty("product");
  });

  it("takes a deposit return as a credit line via its Pfand toggle", async () => {
    const { onApply, user } = renderEditor({
      items: [
        { name: "Brot", quantity: 1, totalMinor: 300, units: [{ uids: ["ben"] }] },
        { name: "Pfand", quantity: 1, totalMinor: 25, units: [{ uids: ["anna"] }] },
      ],
      totalMinor: null,
    });
    await user.click(within(unitButtons(1, 0).item).getByRole("button", { name: "Pfand" }));
    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 275, allocation: { ben: 300, anna: -25 } }),
    );
  });

  it("books a slip of only deposit lines as a credit", async () => {
    const { onApply, user } = renderEditor({
      items: [{ name: "Leergut", quantity: 1, totalMinor: -325 }],
      totalMinor: -325,
    });
    expect(screen.getByText(/als Gutschrift/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: -325,
        allocation: { anna: -109, ben: -108, carl: -108 },
      }),
    );
  });
});
