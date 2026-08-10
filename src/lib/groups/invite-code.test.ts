import { describe, expect, it } from "vitest";
import { generateInviteCode, normalizeInviteCode } from "./invite-code";

describe("generateInviteCode", () => {
  it("generates an 8-character code", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  it("only uses unambiguous uppercase letters and digits", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it("excludes visually ambiguous characters", () => {
    const codes = Array.from({ length: 200 }, () => generateInviteCode()).join("");
    expect(codes).not.toMatch(/[01OIL]/);
  });
});

describe("normalizeInviteCode", () => {
  it("uppercases and trims whitespace", () => {
    expect(normalizeInviteCode(" ab3f9k ")).toBe("AB3F9K");
  });
});
