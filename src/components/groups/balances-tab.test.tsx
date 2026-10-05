import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The Server Actions pull in firebase-admin; the tab only calls them on a tap.
const recordSettlement = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/settlements", () => ({
  recordSettlement,
  editSettlement: vi.fn(),
}));
vi.mock("@/lib/actions/settlement-share", () => ({
  getOrCreateSettlementShareToken: vi.fn(),
  rotateSettlementShareToken: vi.fn(),
}));

import { LocaleProvider } from "@/components/locale-provider";
import type { GroupMember } from "@/lib/types";
import { BalancesTab } from "./balances-tab";

// "So werdet ihr quitt": every suggested transfer can be booked as a payment in
// one tap, with from, to and amount already filled in. (The suggestions
// themselves are covered by balances.test.ts.)

function member(displayName: string): GroupMember {
  return {
    displayName,
    photoURL: "",
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: "member",
    isPlaceholder: false,
  };
}

const members = { anna: member("Anna"), ben: member("Ben"), cleo: member("Cleo") };

function renderTab(balances: Record<string, number>) {
  render(
    <LocaleProvider initialLocale="de">
      <BalancesTab
        groupId="g1"
        groupName="WG"
        balances={balances}
        expenses={[]}
        balanceExpenses={[]}
        settlements={[]}
        members={members}
        currentUid="anna"
        currency="EUR"
        hasShareLink={false}
        canManage={false}
      />
    </LocaleProvider>,
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

describe("BalancesTab — suggested transfers", () => {
  beforeEach(() => {
    setOnline(true);
    recordSettlement.mockReset();
    recordSettlement.mockResolvedValue({ ok: true, data: { settlementId: "s1" } });
  });
  afterEach(() => setOnline(true));

  it("offers one record button per suggested transfer, named after who pays whom", () => {
    // Ben owes Anna 10 €, Cleo owes Anna 5 €.
    renderTab({ anna: 1500, ben: -1000, cleo: -500 });

    expect(
      screen.getByRole("button", { name: /Zahlung eintragen: Ben an Anna, 10,00\s€/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Zahlung eintragen: Cleo an Anna, 5,00\s€/ }),
    ).toBeInTheDocument();
  });

  it("opens the payment form with from, to and amount already filled in, and books exactly that", async () => {
    renderTab({ anna: 1000, ben: -1000, cleo: 0 });

    fireEvent.click(screen.getByRole("button", { name: /Zahlung eintragen: Ben an Anna/ }));

    expect(await screen.findByLabelText("Von")).toHaveValue("ben");
    expect(screen.getByLabelText("An")).toHaveValue("anna");
    expect(screen.getByLabelText(/Betrag/)).toHaveValue("10,00");

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(recordSettlement).toHaveBeenCalledTimes(1));
    expect(recordSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "g1",
        fromUid: "ben",
        toUid: "anna",
        amountMinor: 1000,
        currency: "EUR",
      }),
    );
  });

  it("starts the next transfer from its own numbers, not the form left over from the last", async () => {
    renderTab({ anna: 1500, ben: -1000, cleo: -500 });

    fireEvent.click(screen.getByRole("button", { name: /Zahlung eintragen: Ben an Anna/ }));
    expect(await screen.findByLabelText(/Betrag/)).toHaveValue("10,00");
    fireEvent.keyDown(screen.getByLabelText(/Betrag/), { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText(/Betrag/)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Zahlung eintragen: Cleo an Anna/ }));
    expect(await screen.findByLabelText("Von")).toHaveValue("cleo");
    expect(screen.getByLabelText(/Betrag/)).toHaveValue("5,00");
  });

  it("disables the buttons offline — a payment is a Server Action with nothing to queue it", () => {
    setOnline(false);
    renderTab({ anna: 1000, ben: -1000, cleo: 0 });

    expect(screen.getByRole("button", { name: /Zahlung eintragen: Ben an Anna/ })).toBeDisabled();
  });

  it("shows no button when nobody owes anything", () => {
    renderTab({ anna: 0, ben: 0, cleo: 0 });

    expect(screen.queryByRole("button", { name: /Zahlung eintragen/ })).not.toBeInTheDocument();
    expect(screen.getByText("Niemand muss etwas überweisen.")).toBeInTheDocument();
  });
});
