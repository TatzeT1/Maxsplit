import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const addExpense = vi.fn<(input: unknown) => Promise<unknown>>(async () => ({
  ok: true,
  data: { expenseId: "e1" },
}));
vi.mock("@/lib/actions/expenses", () => ({
  addExpense: (input: unknown) => addExpense(input),
  editExpense: vi.fn(),
}));
vi.mock("@/lib/actions/receipts", () => ({ scanReceipt: vi.fn() }));

import { LocaleProvider } from "@/components/locale-provider";
import type { GroupMember } from "@/lib/types";
import { AddExpenseDialog } from "./add-expense-dialog";

function member(displayName: string): GroupMember {
  return { displayName, photoURL: "", joinedAt: "", role: "member", isPlaceholder: false };
}

const members = { anna: member("Anna"), ben: member("Ben"), carl: member("Carl") };

function renderDialog() {
  render(
    <LocaleProvider initialLocale="de">
      <AddExpenseDialog groupId="g1" members={members} currency="EUR" currentUid="anna" open />
    </LocaleProvider>,
  );
  return userEvent.setup();
}

describe("AddExpenseDialog with a credit (Gutschrift)", () => {
  it("books a deposit slip negative, typed as a positive amount", async () => {
    const user = renderDialog();
    await user.click(screen.getByRole("radio", { name: /Gutschrift/ }));
    // Who has the money now, not who paid; and no game for a refund.
    expect(screen.getByText("Erhalten von")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spiel/ })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Beschreibung"), "Pfandbon");
    await user.type(screen.getByLabelText("Betrag"), "3,25");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(addExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Pfandbon",
        amountMinor: -325,
        paidBy: { anna: -325 },
        splitMode: "equal",
        participantUids: ["anna", "ben", "carl"],
        viaLottery: false,
      }),
    );
  });

  it("turns a typed minus into the credit toggle", async () => {
    const user = renderDialog();
    await user.type(screen.getByLabelText("Betrag"), "-3,25");
    expect(screen.getByRole("radio", { name: /Gutschrift/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Betrag")).toHaveValue("3,25");
  });

  it("negates an exact split typed in positive amounts", async () => {
    addExpense.mockClear();
    const user = renderDialog();
    await user.click(screen.getByRole("radio", { name: /Gutschrift/ }));
    await user.type(screen.getByLabelText("Beschreibung"), "Erstattung");
    await user.type(screen.getByLabelText("Betrag"), "10");
    await user.click(screen.getByRole("button", { name: "Genauer Betrag" }));
    const fields = screen.getAllByPlaceholderText("0,00 EUR").slice(1);
    for (const [field, value] of fields.map((f, i) => [f, ["5", "5", ""][i]] as const)) {
      await user.clear(field);
      if (value) await user.type(field, value);
    }
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(addExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: -1000,
        splitMode: "exact",
        splitInputs: { anna: -500, ben: -500 },
      }),
    );
  });
});
