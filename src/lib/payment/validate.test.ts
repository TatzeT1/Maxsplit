import { describe, expect, it } from "vitest";
import { isValidEmail, isValidIban, normalizeIban } from "./validate";

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
