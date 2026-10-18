import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The Server Action pulls in firebase-admin; the tab only calls it on a tap.
const classifyGroupExpenses = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/products", () => ({ classifyGroupExpenses }));

import { ReceiptScanProvider } from "@/components/groups/receipt-scan-context";
import { LocaleProvider } from "@/components/locale-provider";
import type { Expense, Group, GroupMember } from "@/lib/types";
import { InsightsTab } from "./insights-tab";

function member(displayName: string): GroupMember {
  return { displayName, photoURL: "", joinedAt: "", role: "member", isPlaceholder: false };
}

const group = {
  id: "g1",
  name: "WG",
  currency: "EUR",
  members: { anna: member("Anna"), ben: member("Ben") },
  memberUids: ["anna", "ben"],
} as unknown as Group;

function expense(
  id: string,
  date: string,
  splits: Record<string, number>,
  extra: Partial<Expense> = {},
): Expense {
  const amountMinor = Object.values(splits).reduce((sum, amount) => sum + amount, 0);
  return {
    id,
    description: id,
    amountMinor,
    currency: "EUR",
    date,
    category: null,
    paidBy: { anna: amountMinor },
    splitMode: "exact",
    splits: Object.fromEntries(
      Object.entries(splits).map(([uid, amount]) => [
        uid,
        { rawValue: amount, amountMinor: amount },
      ]),
    ),
    createdBy: "anna",
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    ...extra,
  };
}

const expenses = [
  expense(
    "Metzgerei",
    "2026-10-03",
    { anna: 300, ben: 300 },
    {
      receipt: {
        items: [
          {
            name: "Schweinemett",
            quantity: 2,
            totalMinor: 600,
            units: [{ uids: ["anna"] }, { uids: ["ben"] }],
            product: { family: "meat", kind: "Mett" },
          },
        ],
      },
    },
  ),
  expense(
    "Miete",
    "2026-10-01",
    { anna: 40000, ben: 40000 },
    {
      product: { family: "housing", kind: "Miete" },
    },
  ),
  expense("Pizza", "2026-10-10", { anna: 1000, ben: 1400 }),
  expense(
    "Teewurst",
    "2026-09-12",
    { ben: 199 },
    { product: { family: "meat", kind: "Teewurst" } },
  ),
];

function renderTab({ aiEnabled = true } = {}) {
  render(
    <LocaleProvider initialLocale="de">
      <ReceiptScanProvider enabled={aiEnabled}>
        <InsightsTab groupId="g1" expenses={expenses} group={group} currentUid="anna" />
      </ReceiptScanProvider>
    </LocaleProvider>,
  );
  return userEvent.setup();
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 18, 12));
  setOnline(true);
  classifyGroupExpenses.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("InsightsTab", () => {
  it("shows this month's spending by group and kind, with who had how much", async () => {
    const user = renderTab();
    expect(screen.getByText("Oktober 2026")).toBeInTheDocument();
    expect(screen.getByText("830,00 €")).toBeInTheDocument();

    const rows = screen.getAllByTestId("insights-family");
    expect(rows.map((row) => within(row).getByRole("button").textContent)).toEqual([
      "🏠Miete & Wohnen",
      "🥩Fleisch & Wurst",
    ]);
    expect(within(screen.getByTestId("insights-unclassified")).getByText("24,00 €")).toBeVisible();

    await user.click(within(rows[1]).getByRole("button", { name: /Fleisch & Wurst/ }));
    const [mett] = screen.getAllByTestId("insights-kind");
    expect(within(mett).getByText("Mett")).toBeInTheDocument();
    expect(within(mett).getByText(/^Anna\s3,00\s€ · Ben\s3,00\s€$/)).toBeInTheDocument();
  });

  it("switches to one person's share, and to other periods", async () => {
    const user = renderTab();
    await user.click(screen.getByRole("button", { name: "Ben" }));
    expect(screen.getByText("Anteil von Ben")).toBeInTheDocument();
    expect(screen.getByText("417,00 €")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vorheriger Zeitraum" }));
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getAllByText("1,99 €").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Ich" }));
    expect(screen.getByText("Davon hattest du in diesem Zeitraum nichts.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Gesamt" }));
    expect(screen.getByText("Seit Beginn")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vorheriger Zeitraum" })).not.toBeInTheDocument();
  });

  it("sorts what is missing in steps until nothing remains", async () => {
    classifyGroupExpenses
      .mockResolvedValueOnce({ ok: true, data: { classified: 1, remaining: 1 } })
      .mockResolvedValueOnce({ ok: true, data: { classified: 1, remaining: 0 } });
    const user = renderTab();
    await user.click(screen.getByRole("button", { name: "Jetzt einordnen (1)" }));
    expect(classifyGroupExpenses).toHaveBeenCalledTimes(2);
    expect(classifyGroupExpenses).toHaveBeenCalledWith({ groupId: "g1" });
    expect(await screen.findByRole("status")).toHaveTextContent("Alles eingeordnet.");
  });

  it("says so when the model gets nowhere, or the day's limit is reached", async () => {
    classifyGroupExpenses
      .mockResolvedValueOnce({ ok: true, data: { classified: 0, remaining: 1 } })
      .mockResolvedValueOnce({ ok: false, error: "classify-limit" })
      .mockRejectedValueOnce(new Error("offline"));
    const user = renderTab();
    const button = screen.getByRole("button", { name: "Jetzt einordnen (1)" });
    await user.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent("konnte gerade nichts einordnen");
    await user.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent("genug eingeordnet");
    await user.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent("Keine Verbindung");
  });

  it("offers no sorting offline or without a model", () => {
    setOnline(false);
    renderTab();
    expect(screen.getByRole("button", { name: "Jetzt einordnen (1)" })).toBeDisabled();
  });

  it("hides the button when no model is configured, but still shows the row", () => {
    renderTab({ aiEnabled: false });
    expect(screen.queryByRole("button", { name: /Jetzt einordnen/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("insights-unclassified")).toBeInTheDocument();
  });
});
