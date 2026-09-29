import { describe, expect, it } from "vitest";
import {
  getOrCreateSettlementShareToken,
  rotateSettlementShareToken,
} from "@/lib/actions/settlement-share";
import { readGroup, realMember, seedGroup } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

async function seedWithLink() {
  await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    ada: realMember("Ada", { role: "admin" }),
    lea: realMember("Lea"),
  });
  signInAs({ uid: "lea" });
  const minted = await getOrCreateSettlementShareToken({ groupId: "g1" });
  if (!minted.ok) throw new Error(minted.error);
  return minted.data.token;
}

describe("rotateSettlementShareToken", () => {
  it("replaces the token, so the old link stops matching", async () => {
    const oldToken = await seedWithLink();
    signInAs({ uid: "ada" });

    const rotated = await rotateSettlementShareToken({ groupId: "g1" });
    if (!rotated.ok) throw new Error(rotated.error);

    expect(rotated.data.token).not.toBe(oldToken);
    expect(rotated.data.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect((await readGroup("g1")).settlementShareToken).toBe(rotated.data.token);

    // Everyone who asks afterwards gets the new link, not a fresh third one.
    signInAs({ uid: "lea" });
    expect(await getOrCreateSettlementShareToken({ groupId: "g1" })).toEqual({
      ok: true,
      data: { token: rotated.data.token },
    });
  });

  it("is for owners and admins only — it breaks the link for everyone", async () => {
    const token = await seedWithLink();
    signInAs({ uid: "lea" });

    expect(await rotateSettlementShareToken({ groupId: "g1" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await readGroup("g1")).settlementShareToken).toBe(token);
  });

  it("refuses someone outside the group", async () => {
    await seedWithLink();
    signInAs({ uid: "stranger" });

    expect((await rotateSettlementShareToken({ groupId: "g1" })).ok).toBe(false);
  });
});
