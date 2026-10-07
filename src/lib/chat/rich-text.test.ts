import { describe, expect, it } from "vitest";
import {
  findMentionedUids,
  findMentionQuery,
  findMentionRanges,
  shortenText,
  tokenizeMessage,
} from "./rich-text";

describe("tokenizeMessage", () => {
  it("leaves plain text alone", () => {
    expect(tokenizeMessage("Wer bringt Getränke mit?")).toEqual([
      { type: "text", value: "Wer bringt Getränke mit?" },
    ]);
  });

  it("turns http(s) and www addresses into links", () => {
    expect(tokenizeMessage("Schau https://paypal.me/max und www.split.app/x ok")).toEqual([
      { type: "text", value: "Schau " },
      { type: "link", value: "https://paypal.me/max", href: "https://paypal.me/max" },
      { type: "text", value: " und " },
      { type: "link", value: "www.split.app/x", href: "https://www.split.app/x" },
      { type: "text", value: " ok" },
    ]);
  });

  it("keeps the sentence's punctuation out of the link", () => {
    expect(tokenizeMessage("(siehe https://a.de/b).")).toEqual([
      { type: "text", value: "(siehe " },
      { type: "link", value: "https://a.de/b", href: "https://a.de/b" },
      { type: "text", value: ")." },
    ]);
    expect(tokenizeMessage("https://a.de/Foo_(bar)!")).toEqual([
      { type: "link", value: "https://a.de/Foo_(bar)", href: "https://a.de/Foo_(bar)" },
      { type: "text", value: "!" },
    ]);
  });

  it("never links anything but http(s)", () => {
    expect(tokenizeMessage("javascript:alert(1) und ftp://x.de")).toEqual([
      { type: "text", value: "javascript:alert(1) und ftp://x.de" },
    ]);
  });

  it("marks mentions next to links without touching the link", () => {
    expect(tokenizeMessage("@Lea https://a.de/@Lea", ["Lea"])).toEqual([
      { type: "mention", value: "@Lea" },
      { type: "text", value: " " },
      { type: "link", value: "https://a.de/@Lea", href: "https://a.de/@Lea" },
    ]);
  });
});

describe("findMentionRanges", () => {
  it("matches a whole name, case-insensitively", () => {
    expect(findMentionRanges("Hi @lea, kommst du?", ["Lea"])).toEqual([
      { start: 3, end: 7, name: "Lea" },
    ]);
  });

  it("does not match inside a longer name or an email", () => {
    expect(findMentionRanges("@Maxine und max@lea.de", ["Max", "Lea"])).toEqual([]);
  });

  it("prefers the longest name", () => {
    expect(findMentionRanges("@Max Mustermann zahlt", ["Max", "Max Mustermann"])).toEqual([
      { start: 0, end: 15, name: "Max Mustermann" },
    ]);
  });

  it("finds several mentions", () => {
    const names = findMentionRanges("@Lea und @Ben", ["Lea", "Ben"]).map((range) => range.name);
    expect(names).toEqual(["Lea", "Ben"]);
  });
});

describe("findMentionedUids", () => {
  const members = [
    { uid: "lea", displayName: "Lea" },
    { uid: "ben", displayName: "Ben" },
  ];

  it("returns the uids of the named members", () => {
    expect(findMentionedUids("Danke @Ben!", members)).toEqual(["ben"]);
  });

  it("returns nothing when no one is named", () => {
    expect(findMentionedUids("Danke Ben", members)).toEqual([]);
  });
});

describe("shortenText", () => {
  it("collapses whitespace and cuts with an ellipsis", () => {
    expect(shortenText("a\n\n  b", 10)).toBe("a b");
    expect(shortenText("abcdefghij", 5)).toBe("abcd…");
  });
});

describe("findMentionQuery", () => {
  it("finds the @ being typed at the caret", () => {
    expect(findMentionQuery("Hi @Le", 6)).toEqual({ start: 3, query: "Le" });
    expect(findMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(findMentionQuery("a @Lea und mehr", 6)).toEqual({ start: 2, query: "Lea" });
  });

  it("ignores an @ inside a word or behind a finished one", () => {
    expect(findMentionQuery("max@le", 6)).toBeNull();
    expect(findMentionQuery("@Lea ok", 7)).toBeNull();
    expect(findMentionQuery("kein at", 7)).toBeNull();
  });
});
