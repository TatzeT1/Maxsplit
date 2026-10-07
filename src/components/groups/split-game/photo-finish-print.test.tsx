import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { PhotoFinishPrint } from "./photo-finish-print";

function renderPrint(payerOnLeft: boolean, locale: "de" | "en" = "de") {
  return render(
    <LocaleProvider initialLocale={locale}>
      <PhotoFinishPrint safeName="Ben" payerName="Lea" gapPx={9} payerOnLeft={payerOnLeft} />
    </LocaleProvider>,
  );
}

function duckBox(container: HTMLElement, which: "safe" | "payer"): HTMLElement {
  const box = container.querySelector<HTMLElement>(`[data-print-duck="${which}"]`);
  if (!box) throw new Error(`no ${which} duck`);
  return box;
}

describe("PhotoFinishPrint", () => {
  it("says who got there first", () => {
    renderPrint(false);
    expect(screen.getByText("Fotofinish")).toBeInTheDocument();
    expect(screen.getByText("Ben knapp vor Lea")).toBeInTheDocument();
  });

  it("says it in English too", () => {
    renderPrint(false, "en");
    expect(screen.getByText("Photo finish")).toBeInTheDocument();
    expect(screen.getByText("Ben just ahead of Lea")).toBeInTheDocument();
  });

  it("draws the payer exactly the gap short of the line, with the lantern over it alone", () => {
    const { container } = renderPrint(false);
    const safe = duckBox(container, "safe");
    const payer = duckBox(container, "payer");
    // The ducks swim down the photo: further from the line means higher up.
    expect(parseFloat(safe.style.top) - parseFloat(payer.style.top)).toBeCloseTo(9, 6);
    expect(payer.textContent).toContain("🏮");
    expect(safe.textContent).not.toContain("🏮");
  });

  it("keeps the two lanes in the order they swam", () => {
    const right = renderPrint(false);
    expect(duckBox(right.container, "safe").style.left).toBe("30%");
    expect(duckBox(right.container, "payer").style.left).toBe("70%");
    right.unmount();
    const left = renderPrint(true);
    expect(duckBox(left.container, "payer").style.left).toBe("30%");
    expect(duckBox(left.container, "safe").style.left).toBe("70%");
  });
});
