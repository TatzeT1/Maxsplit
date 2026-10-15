import { afterEach, describe, expect, it } from "vitest";
import { APP_STYLES, DEFAULT_APP_STYLE, isAppStyle, setAppStyle } from "./app-style";

// The style list is mirrored by hand in THEME_INIT_SCRIPT (app/layout.tsx),
// which runs before any module loads; these pin the module's side of it.

afterEach(() => {
  delete document.documentElement.dataset.style;
  window.localStorage.clear();
});

describe("app styles", () => {
  it("knows exactly the seven styles, Graphit first and default", () => {
    expect(APP_STYLES).toEqual([
      "graphit",
      "original",
      "fallblatt",
      "bierdeckel",
      "riso",
      "schmetterling",
      "herzblatt",
    ]);
    expect(DEFAULT_APP_STYLE).toBe("graphit");
  });

  it("rejects anything that isn't a style", () => {
    expect(isAppStyle("riso")).toBe(true);
    expect(isAppStyle("Riso")).toBe(false);
    expect(isAppStyle(null)).toBe(false);
    expect(isAppStyle("dark")).toBe(false);
  });

  it("applies a style to <html> and remembers it", () => {
    setAppStyle("bierdeckel");
    expect(document.documentElement.dataset.style).toBe("bierdeckel");
    expect(window.localStorage.getItem("style")).toBe("bierdeckel");
  });
});
