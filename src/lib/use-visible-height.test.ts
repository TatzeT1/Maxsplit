import { describe, expect, it } from "vitest";
import { computeVisibleHeight } from "@/lib/use-visible-height";

// Numbers below are an iPhone 13 standalone PWA: 664px layout viewport with a
// 56px app top bar above the chat, and a ~336px German keyboard.
describe("computeVisibleHeight", () => {
  it("fills the viewport below the element when no keyboard is open", () => {
    expect(computeVisibleHeight(664, 0, 56)).toBe(608);
  });

  it("shrinks by the keyboard on iOS, where the layout viewport does not", () => {
    // visualViewport is the only thing that reports the covered area; the
    // composer must end up exactly at the keyboard's top edge (56 + 272 = 328).
    expect(computeVisibleHeight(328, 0, 56)).toBe(272);
  });

  it("adds back the visual viewport scroll iOS applies to reveal the field", () => {
    expect(computeVisibleHeight(328, 40, 56)).toBe(312);
  });

  it("matches the full viewport for an element flush with the top", () => {
    expect(computeVisibleHeight(664, 0, 0)).toBe(664);
  });

  it("never returns a negative height when the element is scrolled past", () => {
    expect(computeVisibleHeight(328, 0, 500)).toBe(0);
  });

  it("rounds sub-pixel viewport measurements", () => {
    expect(computeVisibleHeight(663.6, 0, 56)).toBe(608);
  });
});
