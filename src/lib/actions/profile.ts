"use server";

import { FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { MAX_NAME_LENGTH } from "@/lib/ledger-input";
import { EPC_MAX_NAME_CHARS } from "@/lib/payment/epc-qr";
import { pickPaymentDetails } from "@/lib/payment/member-payment-details";
import { syncMemberPaymentDetails } from "@/lib/payment/sync-member-payment-details";
import {
  isValidEmail,
  isValidIban,
  isValidPaypalMeHandle,
  normalizeIban,
  normalizePaypalMeHandle,
} from "@/lib/payment/validate";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Updates the user's own display name and propagates it to every group's
 * per-member snapshot (`group.members[uid].displayName`), which is what
 * expense/balance/activity UI actually renders — see GroupMember in
 * lib/types.ts. `memberUids` only ever holds real, authenticated members, so
 * every group returned by this query is safe to update at `members.{uid}`.
 */
export async function updateDisplayName(input: {
  displayName: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const name = input.displayName.trim();
  if (!name) return { ok: false, error: "invalid-name" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "invalid-name" };

  await adminDb.doc(`users/${session.uid}`).set({ displayName: name }, { merge: true });

  const groups = await adminDb
    .collection("groups")
    .where("memberUids", "array-contains", session.uid)
    .get();

  if (!groups.empty) {
    const batch = adminDb.batch();
    for (const doc of groups.docs) {
      batch.update(doc.ref, { [`members.${session.uid}.displayName`]: name });
    }
    await batch.commit();
  }

  return { ok: true, data: null };
}

/**
 * Updates the user's own PayPal email / IBAN / PayPal.Me handle / account
 * holder name and propagates them to every group's per-member snapshot
 * (`group.members[uid]`, the fields in MEMBER_PAYMENT_FIELDS), the same
 * denormalization `updateDisplayName` above uses — see MembersPanel, which
 * reads from there so co-members can copy them without a `users/{uid}` read
 * (that doc is only readable by its own owner, see firestore.rules). An
 * empty string clears a field. `paypalMeHandle` accepts either a bare
 * username or a full PayPal.Me link (see normalizePaypalMeHandle) and always
 * stores the bare username.
 */
export async function updatePaymentDetails(input: {
  paypalEmail: string;
  iban: string;
  paypalMeHandle: string;
  accountHolderName: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const paypalEmail = input.paypalEmail.trim();
  if (paypalEmail && !isValidEmail(paypalEmail)) {
    return { ok: false, error: "invalid-paypal-email" };
  }

  const iban = input.iban.trim() ? normalizeIban(input.iban) : "";
  if (iban && !isValidIban(iban)) {
    return { ok: false, error: "invalid-iban" };
  }

  const paypalMeHandle = input.paypalMeHandle.trim()
    ? normalizePaypalMeHandle(input.paypalMeHandle)
    : "";
  if (paypalMeHandle && !isValidPaypalMeHandle(paypalMeHandle)) {
    return { ok: false, error: "invalid-paypal-me-handle" };
  }

  const accountHolderName =
    typeof input.accountHolderName === "string"
      ? input.accountHolderName.replace(/\s+/g, " ").trim()
      : "";
  if (accountHolderName.length > EPC_MAX_NAME_CHARS) {
    return { ok: false, error: "invalid-account-holder" };
  }

  await adminDb.doc(`users/${session.uid}`).set(
    {
      paypalEmail: paypalEmail || FieldValue.delete(),
      iban: iban || FieldValue.delete(),
      paypalMeHandle: paypalMeHandle || FieldValue.delete(),
      accountHolderName: accountHolderName || FieldValue.delete(),
    },
    { merge: true },
  );

  await syncMemberPaymentDetails(
    session.uid,
    pickPaymentDetails({ paypalEmail, iban, paypalMeHandle, accountHolderName }),
  );

  return { ok: true, data: null };
}
