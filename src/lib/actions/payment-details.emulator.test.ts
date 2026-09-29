import { describe, expect, it } from "vitest";
import { adminResyncPaymentDetails } from "@/lib/actions/admin";
import { createGroup, joinGroupByInviteCode } from "@/lib/actions/groups";
import { updatePaymentDetails } from "@/lib/actions/profile";
import { adminDb } from "@/lib/firebase/admin";
import { placeholderMember, readGroup, realMember, seedGroup } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

const LEA_PAYMENT = {
  paypalEmail: "lea@example.com",
  iban: "DE89370400440532013000",
  paypalMeHandle: "leapay",
};

describe("payment details reach every group a member joins", () => {
  it("createGroup copies the creator's PayPal.Me handle, not just email and IBAN", async () => {
    signInAs({ uid: "lea", ...LEA_PAYMENT });

    const result = await createGroup({ name: "Urlaub", currency: "EUR" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const group = await readGroup(result.data.groupId);
    expect(group.members.lea).toMatchObject(LEA_PAYMENT);
  });

  it("joining by invite code copies the PayPal.Me handle", async () => {
    await seedGroup("g1", { max: realMember("Max", { role: "owner" }) });
    signInAs({ uid: "lea", ...LEA_PAYMENT });

    const result = await joinGroupByInviteCode({ inviteCode: "CODEG1" });
    expect(result.ok).toBe(true);

    expect((await readGroup("g1")).members.lea).toMatchObject(LEA_PAYMENT);
  });

  it("claiming a placeholder copies the PayPal.Me handle", async () => {
    await seedGroup("g1", {
      max: realMember("Max", { role: "owner" }),
      ph_lea: placeholderMember("Lea"),
    });
    signInAs({ uid: "lea", ...LEA_PAYMENT });

    const result = await joinGroupByInviteCode({
      inviteCode: "CODEG1",
      claimPlaceholderId: "ph_lea",
    });
    expect(result.ok).toBe(true);

    const group = await readGroup("g1");
    expect(group.members.lea).toMatchObject({ ...LEA_PAYMENT, isPlaceholder: false });
    expect(group.members.ph_lea).toBeUndefined();
  });

  it("leaves unset fields out of the member entry instead of storing empty strings", async () => {
    signInAs({ uid: "lea", paypalMeHandle: "leapay" });

    const result = await createGroup({ name: "Urlaub", currency: "EUR" });
    if (!result.ok) throw new Error(result.error);

    const member = (await readGroup(result.data.groupId)).members.lea;
    expect(member.paypalMeHandle).toBe("leapay");
    expect("iban" in member).toBe(false);
    expect("paypalEmail" in member).toBe(false);
  });

  it("updatePaymentDetails still propagates to every group, clearing removed fields", async () => {
    await seedGroup("g1", { lea: realMember("Lea", { paypalEmail: "old@example.com" }) });
    await seedGroup("g2", { lea: realMember("Lea") });
    signInAs({ uid: "lea" });

    const result = await updatePaymentDetails({
      paypalEmail: "",
      iban: "de89 3704 0044 0532 0130 00",
      paypalMeHandle: "https://paypal.me/leapay/",
    });
    expect(result.ok).toBe(true);

    for (const groupId of ["g1", "g2"]) {
      const member = (await readGroup(groupId)).members.lea;
      expect(member.iban).toBe("DE89370400440532013000");
      expect(member.paypalMeHandle).toBe("leapay");
      expect(member.paypalEmail).toBeUndefined();
    }
  });
});

describe("adminResyncPaymentDetails", () => {
  const admin = { uid: "admin", email: "max123.tietz@gmail.com", emailVerified: true };

  it("repairs member entries that drifted from the profile, and only those", async () => {
    await adminDb.doc("users/lea").set({ displayName: "Lea", ...LEA_PAYMENT });
    await adminDb.doc("users/max").set({ displayName: "Max", iban: "DE89370400440532013000" });
    // Lea joined g1 before the handle was copied on join; g2 is already correct.
    await seedGroup("g1", {
      max: realMember("Max", { role: "owner", iban: "DE89370400440532013000" }),
      lea: realMember("Lea", { paypalEmail: LEA_PAYMENT.paypalEmail, iban: LEA_PAYMENT.iban }),
    });
    await seedGroup("g2", { lea: realMember("Lea", LEA_PAYMENT) });
    signInAs(admin);

    const first = await adminResyncPaymentDetails();
    expect(first).toEqual({ ok: true, data: { users: 2, groupsUpdated: 1 } });
    expect((await readGroup("g1")).members.lea).toMatchObject(LEA_PAYMENT);

    const second = await adminResyncPaymentDetails();
    expect(second).toEqual({ ok: true, data: { users: 2, groupsUpdated: 0 } });
  });

  it("is refused for anyone but the admin", async () => {
    signInAs({ uid: "lea", email: "lea@example.com" });
    expect(await adminResyncPaymentDetails()).toEqual({ ok: false, error: "forbidden" });

    // An unverified claim of the admin's address is not the admin.
    signInAs({ ...admin, emailVerified: false });
    expect(await adminResyncPaymentDetails()).toEqual({ ok: false, error: "forbidden" });
  });
});
