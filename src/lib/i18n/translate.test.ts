import { describe, expect, it } from "vitest";
import { translate } from "./translate";

describe("translate", () => {
  it("resolves a nested dot path in German", () => {
    expect(translate("de", "common.save")).toBe("Speichern");
  });

  it("resolves a nested dot path in English", () => {
    expect(translate("en", "common.save")).toBe("Save");
  });

  it("interpolates placeholders", () => {
    expect(translate("de", "balances.youOwe", { name: "Anna", amount: "12,50 €" })).toBe(
      "Du schuldest Anna 12,50 €",
    );
  });

  it("leaves unmatched placeholders untouched", () => {
    expect(translate("de", "groups.memberSince", {})).toBe("Dabei seit {{date}}");
  });
});
