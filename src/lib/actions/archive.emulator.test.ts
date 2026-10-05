import { describe, expect, it } from "vitest";
import { setGroupArchived } from "@/lib/actions/groups";
import { readGroup, realMember, seedExpense, seedGroup, seedRecurringRule } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

// Archiving moves a group to "Archiviert" for everyone in it. It's a manager's
// call, and it must not leave a recurring rule booking into a group nobody
// looks at any more.

async function seedTeam() {
  return seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    ada: realMember("Ada", { role: "admin" }),
    lea: realMember("Lea"),
  });
}

describe("setGroupArchived", () => {
  it("lets the owner and an admin archive and bring a group back", async () => {
    await seedTeam();

    signInAs({ uid: "max" });
    expect(await setGroupArchived({ groupId: "g1", archived: true })).toEqual({
      ok: true,
      data: null,
    });
    expect((await readGroup("g1")).archived).toBe(true);

    signInAs({ uid: "ada" });
    expect(await setGroupArchived({ groupId: "g1", archived: false })).toEqual({
      ok: true,
      data: null,
    });
    expect((await readGroup("g1")).archived).toBe(false);
  });

  it("is not for plain members — it moves the group for everyone", async () => {
    await seedTeam();
    signInAs({ uid: "lea" });

    expect(await setGroupArchived({ groupId: "g1", archived: true })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await readGroup("g1")).archived).toBe(false);
  });

  it("is not for outsiders either, and says nothing about a group that isn't there", async () => {
    await seedTeam();

    signInAs({ uid: "stranger" });
    expect(await setGroupArchived({ groupId: "g1", archived: true })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setGroupArchived({ groupId: "nope", archived: true })).toEqual({
      ok: false,
      error: "not-found",
    });
  });

  it("rejects anything but a boolean, so a crafted request can't write junk into the flag", async () => {
    await seedTeam();
    signInAs({ uid: "max" });

    expect(
      await setGroupArchived({ groupId: "g1", archived: "yes" as unknown as boolean }),
    ).toEqual({ ok: false, error: "invalid-archived" });
    expect((await readGroup("g1")).archived).toBe(false);
  });

  it("refuses to archive while a recurring rule is still running", async () => {
    const groupRef = await seedTeam();
    await seedRecurringRule(groupRef, "max", ["max", "lea"]);
    signInAs({ uid: "max" });

    expect(await setGroupArchived({ groupId: "g1", archived: true })).toEqual({
      ok: false,
      error: "has-active-recurring",
    });
    expect((await readGroup("g1")).archived).toBe(false);
  });

  it("archives once the rules are paused — a paused rule books nothing", async () => {
    const groupRef = await seedTeam();
    await seedRecurringRule(groupRef, "max", ["max", "lea"], { active: false });
    signInAs({ uid: "max" });

    expect(await setGroupArchived({ groupId: "g1", archived: true })).toEqual({
      ok: true,
      data: null,
    });
  });

  it("brings a group back even with a rule running, and touches nothing but the flag", async () => {
    const groupRef = await seedTeam();
    await seedRecurringRule(groupRef, "max", ["max", "lea"]);
    await seedExpense(groupRef, "max", { max: 1000, lea: 1000 });
    await groupRef.update({ archived: true });
    const before = await readGroup("g1");
    signInAs({ uid: "max" });

    expect(await setGroupArchived({ groupId: "g1", archived: false })).toEqual({
      ok: true,
      data: null,
    });

    expect(await readGroup("g1")).toEqual({ ...before, archived: false });
    expect((await groupRef.collection("expenses").get()).size).toBe(1);
  });

  it("is idempotent", async () => {
    await seedTeam();
    signInAs({ uid: "max" });

    await setGroupArchived({ groupId: "g1", archived: true });
    expect(await setGroupArchived({ groupId: "g1", archived: true })).toEqual({
      ok: true,
      data: null,
    });
    expect((await readGroup("g1")).archived).toBe(true);
  });
});
