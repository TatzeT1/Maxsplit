import { describe, expect, it } from "vitest";
import { leadsTo } from "./dismiss";

const ORIGIN = "https://split.example";

describe("leadsTo", () => {
  it("matches the page a notification opens, ignoring the query", () => {
    expect(leadsTo("/groups/g1/chat", "/groups/g1/chat", ORIGIN)).toBe(true);
    expect(leadsTo("/groups/g1?tab=balances", "/groups/g1", ORIGIN)).toBe(true);
    expect(leadsTo("/groups/g1/tournaments/t1", "/groups/g1/tournaments/t1", ORIGIN)).toBe(true);
  });

  it("leaves other pages' notifications alone", () => {
    expect(leadsTo("/groups/g1/chat", "/groups/g1", ORIGIN)).toBe(false);
    expect(leadsTo("/groups/g1", "/groups/g1/chat", ORIGIN)).toBe(false);
    expect(leadsTo("/groups/g2/chat", "/groups/g1/chat", ORIGIN)).toBe(false);
  });

  it("ignores missing, malformed and foreign urls", () => {
    expect(leadsTo(undefined, "/groups", ORIGIN)).toBe(false);
    expect(leadsTo(42, "/groups", ORIGIN)).toBe(false);
    expect(leadsTo("http://[bad", "/groups", ORIGIN)).toBe(false);
    expect(leadsTo("https://evil.example/groups", "/groups", ORIGIN)).toBe(false);
  });
});
