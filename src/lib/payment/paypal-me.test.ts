import { describe, expect, it } from "vitest";
import { buildPaypalMeLink } from "./paypal-me";

describe("buildPaypalMeLink", () => {
  it("builds a link with a dot decimal separator", () => {
    expect(buildPaypalMeLink("maxrobin", 25.5)).toBe("https://paypal.me/maxrobin/25.50EUR");
  });

  it("defaults the currency to EUR", () => {
    expect(buildPaypalMeLink("maxrobin", 10)).toBe("https://paypal.me/maxrobin/10.00EUR");
  });

  it("respects an explicit currency", () => {
    expect(buildPaypalMeLink("maxrobin", 10, "USD")).toBe("https://paypal.me/maxrobin/10.00USD");
  });

  it("formats without a thousands separator", () => {
    expect(buildPaypalMeLink("maxrobin", 1234.5)).toBe("https://paypal.me/maxrobin/1234.50EUR");
  });
});
