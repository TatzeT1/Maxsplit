import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { ReceiptScanOverlay } from "./receipt-scan-overlay";

const PHOTO = "data:image/jpeg;base64,/9j/AAAA";

function renderOverlay(props: Partial<Parameters<typeof ReceiptScanOverlay>[0]> = {}) {
  const onCancel = vi.fn();
  const view = render(
    <LocaleProvider initialLocale="de">
      <ReceiptScanOverlay open image={PHOTO} itemCount={null} onCancel={onCancel} {...props} />
    </LocaleProvider>,
  );
  return { onCancel, view };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ReceiptScanOverlay", () => {
  it("prepares first, then scans the photo with a beam and a moving status line", () => {
    vi.useFakeTimers();
    const { view } = renderOverlay({ image: null });
    expect(screen.getByText(/Foto wird vorbereitet/)).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-scan-beam")).not.toBeInTheDocument();

    view.rerender(
      <LocaleProvider initialLocale="de">
        <ReceiptScanOverlay open image={PHOTO} itemCount={null} onCancel={vi.fn()} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("receipt-scan-beam")).toBeInTheDocument();
    expect(screen.getByText(/Positionen suchen/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_600));
    expect(screen.getByText(/Namen entziffern/)).toBeInTheDocument();
  });

  it("explains a long wait instead of just spinning on", () => {
    vi.useFakeTimers();
    renderOverlay();
    expect(screen.queryByText(/Dauert etwas länger/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(9_000));
    expect(screen.getByText(/Dauert etwas länger/)).toBeInTheDocument();
  });

  it("stamps the slip when the items are in, and can no longer be cancelled", () => {
    renderOverlay({ itemCount: 2 });
    expect(screen.getByText("2 erkannt")).toBeInTheDocument();
    expect(screen.getByText(/2 Positionen erkannt/)).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-scan-beam")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abbrechen", hidden: true })).toBeDisabled();
  });

  it("lets the wait be cancelled", async () => {
    const { onCancel } = renderOverlay();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
