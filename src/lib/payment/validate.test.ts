import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidIban,
  isValidPaypalMeHandle,
  normalizeIban,
  normalizePaypalMeHandle,
} from "./validate";

describe("normalizeIban", () => {
  it("strips whitespace and uppercases", () => {
    expect(normalizeIban(" de89 3704 0044 0532 0130 00 ")).toBe("DE89370400440532013000");
  });
});

describe("isValidIban", () => {
  it("accepts real IBANs from several countries", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("GB29 NWBK 6016 1331 9268 19")).toBe(true);
    expect(isValidIban("FR1420041010050500013M02606")).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isValidIban("de89 3704 0044 0532 0130 00")).toBe(true);
  });

  it("rejects a bad checksum", () => {
    expect(isValidIban("DE89370400440532013001")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidIban("not an iban")).toBe(false);
    expect(isValidIban("")).toBe(false);
    expect(isValidIban("DE8937040044")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible email", () => {
    expect(isValidEmail("max@example.com")).toBe(true);
  });

  it("rejects obviously invalid input", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isValidPaypalMeHandle", () => {
  it("accepts a plain alphanumeric handle", () => {
    expect(isValidPaypalMeHandle("maxrobin")).toBe(true);
    expect(isValidPaypalMeHandle("Max123")).toBe(true);
  });

  it("rejects a full paypal.me URL", () => {
    expect(isValidPaypalMeHandle("https://paypal.me/maxrobin")).toBe(false);
    expect(isValidPaypalMeHandle("paypal.me/maxrobin")).toBe(false);
  });

  it("rejects spaces and other punctuation", () => {
    expect(isValidPaypalMeHandle("max robin")).toBe(false);
    expect(isValidPaypalMeHandle("max-robin")).toBe(false);
    expect(isValidPaypalMeHandle("max_robin")).toBe(false);
    expect(isValidPaypalMeHandle("max.robin")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isValidPaypalMeHandle("")).toBe(false);
    expect(isValidPaypalMeHandle("   ")).toBe(false);
  });

  it("rejects handles longer than 20 characters", () => {
    expect(isValidPaypalMeHandle("a".repeat(21))).toBe(false);
    expect(isValidPaypalMeHandle("a".repeat(20))).toBe(true);
  });
});

describe("normalizePaypalMeHandle", () => {
  it("passes a bare handle through unchanged", () => {
    expect(normalizePaypalMeHandle("maxrobin")).toBe("maxrobin");
  });

  it("extracts the handle from a full link, preserving its case", () => {
    expect(normalizePaypalMeHandle("https://www.paypal.me/MaximilianTietz448")).toBe(
      "MaximilianTietz448",
    );
  });

  it("accepts variations in scheme and www.", () => {
    expect(normalizePaypalMeHandle("http://paypal.me/maxrobin")).toBe("maxrobin");
    expect(normalizePaypalMeHandle("https://paypal.me/maxrobin")).toBe("maxrobin");
    expect(normalizePaypalMeHandle("www.paypal.me/maxrobin")).toBe("maxrobin");
    expect(normalizePaypalMeHandle("paypal.me/maxrobin")).toBe("maxrobin");
  });

  it("is case-insensitive on the domain", () => {
    expect(normalizePaypalMeHandle("https://PayPal.Me/maxrobin")).toBe("maxrobin");
  });

  it("strips a trailing slash", () => {
    expect(normalizePaypalMeHandle("https://paypal.me/maxrobin/")).toBe("maxrobin");
  });

  it("strips a trailing query string", () => {
    expect(normalizePaypalMeHandle("https://paypal.me/maxrobin?locale.x=de_DE")).toBe("maxrobin");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePaypalMeHandle("  https://paypal.me/maxrobin  ")).toBe("maxrobin");
  });

  it("leaves an unrelated URL untouched, so validation rejects it", () => {
    expect(normalizePaypalMeHandle("https://example.com/maxrobin")).toBe(
      "https://example.com/maxrobin",
    );
  });

  it("leaves empty input untouched", () => {
    expect(normalizePaypalMeHandle("")).toBe("");
    expect(normalizePaypalMeHandle("   ")).toBe("");
  });
});
