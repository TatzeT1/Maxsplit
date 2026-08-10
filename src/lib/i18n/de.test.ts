import { describe, expect, it } from "vitest";
import { t } from "./de";

describe("t", () => {
  it("resolves a nested dot path", () => {
    expect(t("common.save")).toBe("Speichern");
  });

  it("interpolates placeholders", () => {
    expect(t("balances.youOwe", { name: "Anna", amount: "12,50 €" })).toBe(
      "Du schuldest Anna 12,50 €",
    );
  });

  it("leaves unmatched placeholders untouched", () => {
    expect(t("groups.memberSince", {})).toBe("Dabei seit {{date}}");
  });
});
