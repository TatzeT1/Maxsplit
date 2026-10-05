import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The Server Actions pull in firebase-admin, and the dialogs are not what's
// under test: a row's menu, its confirmation and what comes after the delete.
const actions = vi.hoisted(() => ({
  deleteExpense: vi.fn(),
  restoreExpense: vi.fn(),
  deleteSettlement: vi.fn(),
  restoreSettlement: vi.fn(),
}));
vi.mock("@/lib/actions/expenses", () => ({
  deleteExpense: actions.deleteExpense,
  restoreExpense: actions.restoreExpense,
}));
vi.mock("@/lib/actions/settlements", () => ({
  deleteSettlement: actions.deleteSettlement,
  restoreSettlement: actions.restoreSettlement,
}));
vi.mock("@/components/groups/add-expense-dialog", () => ({ AddExpenseDialog: () => null }));
vi.mock("@/components/groups/expense-detail-dialog", () => ({ ExpenseDetailDialog: () => null }));
vi.mock("@/components/groups/record-settlement-dialog", () => ({
  RecordSettlementDialog: () => null,
}));
vi.mock("@/components/groups/invite-share-button", () => ({ InviteShareButton: () => null }));

import { LocaleProvider } from "@/components/locale-provider";
import type { ActivityLogEntry, Expense, Group, GroupMember, Settlement } from "@/lib/types";
import { ActivityFeed } from "./activity-feed";

// Deleting from the ledger offers a way back — and the offer has to outlive the
// row it belongs to.

function member(displayName: string): GroupMember {
  return {
    displayName,
    photoURL: "",
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: "member",
    isPlaceholder: false,
  };
}

const group = {
  id: "g1",
  name: "WG",
  currency: "EUR",
  members: { max: { ...member("Max"), role: "owner" }, lea: member("Lea") },
  memberUids: ["max", "lea"],
} as unknown as Group;

const pizza: Expense = {
  id: "e1",
  description: "Pizza",
  amountMinor: 3000,
  currency: "EUR",
  date: "2026-09-29",
  category: "restaurant",
  paidBy: { max: 3000 },
  splitMode: "equal",
  splits: { max: { rawValue: 1, amountMinor: 1500 }, lea: { rawValue: 1, amountMinor: 1500 } },
  createdBy: "max",
  createdAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T12:00:00.000Z",
  deletedAt: null,
};

const payment: Settlement = {
  id: "s1AAAAAAAAAAAAAAAAAA",
  fromUid: "lea",
  toUid: "max",
  amountMinor: 1500,
  currency: "EUR",
  date: "2026-09-30",
  note: "Bar",
  createdBy: "max",
  createdAt: "2026-09-30T12:00:00.000Z",
};

function feed(
  expenses: Expense[],
  settlements: Settlement[] = [],
  activityLog: ActivityLogEntry[] = [],
) {
  return (
    <LocaleProvider initialLocale="de">
      <ActivityFeed
        expenses={expenses}
        settlements={settlements}
        activityLog={activityLog}
        group={group}
        currentUid="max"
      />
    </LocaleProvider>
  );
}

/** Menu → Löschen → the confirmation's Löschen, as a thumb would. */
async function deleteThroughMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Weitere Aktionen" }));
  await user.click(await screen.findByRole("menuitem", { name: "Löschen" }));
  await user.click(await screen.findByRole("button", { name: "Löschen" }));
}

describe("ActivityFeed — undoing a deletion", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    for (const action of Object.values(actions)) action.mockReset();
    actions.deleteExpense.mockResolvedValue({ ok: true, data: null });
    actions.restoreExpense.mockResolvedValue({ ok: true, data: null });
    actions.deleteSettlement.mockResolvedValue({ ok: true, data: null });
    actions.restoreSettlement.mockResolvedValue({ ok: true, data: { settlementId: "s1" } });
  });

  it("offers to undo a deleted expense, and the undo restores exactly that expense", async () => {
    const user = userEvent.setup();
    render(feed([pizza]));

    await deleteThroughMenu(user);

    expect(actions.deleteExpense).toHaveBeenCalledWith({ groupId: "g1", expenseId: "e1" });
    expect(await screen.findByText("„Pizza“ gelöscht")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rückgängig" }));

    expect(actions.restoreExpense).toHaveBeenCalledWith({ groupId: "g1", expenseId: "e1" });
    expect(screen.queryByText("„Pizza“ gelöscht")).not.toBeInTheDocument();
  });

  it("keeps the offer when that was the last entry and the list gives way to the empty state", async () => {
    const user = userEvent.setup();
    const { rerender } = render(feed([pizza]));
    await deleteThroughMenu(user);

    // What the snapshot listener does once the server confirmed the deletion.
    rerender(feed([]));

    expect(screen.getByText("Noch keine Ausgaben")).toBeInTheDocument();
    expect(screen.getByText("„Pizza“ gelöscht")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(actions.restoreExpense).toHaveBeenCalledTimes(1);
  });

  it("offers nothing when the delete itself failed — and says so", async () => {
    actions.deleteExpense.mockResolvedValue({ ok: false, error: "not-owner" });
    const user = userEvent.setup();
    render(feed([pizza]));

    await deleteThroughMenu(user);

    expect(await screen.findByText(/nur eigene Ausgaben/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument();
  });

  it("shows a delete that never reached the server as an error, not a stuck row", async () => {
    actions.deleteExpense.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(feed([pizza]));

    await deleteThroughMenu(user);

    expect(await screen.findByText(/konnte nicht gelöscht werden/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument();
  });

  it("undoes a deleted payment by handing back the one that was on screen", async () => {
    const user = userEvent.setup();
    render(feed([pizza], [payment]));

    const paymentRow = screen.getByText(/Lea hat Max .* bezahlt/).closest("li") as HTMLElement;
    await user.click(within(paymentRow).getByRole("button", { name: "Weitere Aktionen" }));
    await user.click(await screen.findByRole("menuitem", { name: "Löschen" }));
    await user.click(await screen.findByRole("button", { name: "Löschen" }));

    expect(actions.deleteSettlement).toHaveBeenCalledWith({
      groupId: "g1",
      settlementId: payment.id,
    });
    expect(await screen.findByText("Zahlung gelöscht")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rückgängig" }));

    expect(actions.restoreSettlement).toHaveBeenCalledWith({
      groupId: "g1",
      settlementId: payment.id,
      fromUid: "lea",
      toUid: "max",
      amountMinor: 1500,
      currency: "EUR",
      date: "2026-09-30",
      note: "Bar",
    });
  });

  it("writes an undone deletion into the history, so a 'deleted' line doesn't stand alone", () => {
    const restored: ActivityLogEntry = {
      id: "l1",
      type: "expense_restored",
      actorUid: "lea",
      description: "Pizza",
      createdAt: "2026-09-29T12:05:00.000Z",
    };
    render(feed([pizza], [], [restored]));

    expect(screen.getByText("Lea hat „Pizza“ wiederhergestellt")).toBeInTheDocument();
  });

  it("no longer tells people a deletion can't be undone", async () => {
    const user = userEvent.setup();
    render(feed([pizza]));

    await user.click(screen.getByRole("button", { name: "Weitere Aktionen" }));
    await user.click(await screen.findByRole("menuitem", { name: "Löschen" }));

    expect(await screen.findByText(/noch rückgängig machen/)).toBeInTheDocument();
    expect(screen.queryByText(/nicht rückgängig gemacht/)).not.toBeInTheDocument();
  });
});
