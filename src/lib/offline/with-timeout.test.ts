import { describe, expect, it } from "vitest";
import { TIMEOUT, withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("resolves with the promise's value when it settles before the timeout", async () => {
    const fast = new Promise((resolve) => setTimeout(() => resolve("done"), 5));
    expect(await withTimeout(fast, 50)).toBe("done");
  });

  it("resolves with TIMEOUT when the promise is still pending", async () => {
    const slow = new Promise(() => {});
    expect(await withTimeout(slow, 5)).toBe(TIMEOUT);
  });

  it("lets the original promise keep running after a timeout", async () => {
    let settled = false;
    const slow = new Promise<void>((resolve) => setTimeout(() => resolve(), 20)).then(() => {
      settled = true;
    });
    expect(await withTimeout(slow, 5)).toBe(TIMEOUT);
    expect(settled).toBe(false);
    await slow;
    expect(settled).toBe(true);
  });
});
