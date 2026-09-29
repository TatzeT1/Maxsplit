import { describe, expect, it } from "vitest";
import { callAction } from "@/lib/call-action";

describe("callAction", () => {
  it("passes the action's own result through, errors included", async () => {
    expect(await callAction(async () => ({ ok: true, data: { id: "e1" } }))).toEqual({
      ok: true,
      data: { id: "e1" },
    });
    expect(await callAction(async () => ({ ok: false, error: "forbidden" }))).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("turns a call that never reached the server into a result, not a rejection", async () => {
    // What a Server Action does offline: the fetch underneath it throws.
    const offline = async (): Promise<{ ok: true; data: null }> => {
      throw new TypeError("Failed to fetch");
    };
    expect(await callAction(offline)).toEqual({ ok: false, error: "network" });
  });
});
