"use server";

import { FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { isValidEmail, isValidIban, normalizeIban } from "@/lib/payment/validate";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_DISPLAY_NAME_LENGTH = 60;

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
  if (name.length > MAX_DISPLAY_NAME_LENGTH) return { ok: false, error: "invalid-name" };

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
 * Updates the user's own PayPal email / IBAN and propagates them to every
 * group's per-member snapshot (`group.members[uid].paypalEmail`/`.iban`), the
 * same denormalization `updateDisplayName` above uses — see MembersPanel,
 * which reads from there so co-members can copy them without a `users/{uid}`
 * read (that doc is only readable by its own owner, see firestore.rules).
 * An empty string clears the field.
 */
export async function updatePaymentDetails(input: {
  paypalEmail: string;
  iban: string;
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

  await adminDb.doc(`users/${session.uid}`).set(
    {
      paypalEmail: paypalEmail || FieldValue.delete(),
      iban: iban || FieldValue.delete(),
    },
    { merge: true },
  );

  const groups = await adminDb
    .collection("groups")
    .where("memberUids", "array-contains", session.uid)
    .get();

  if (!groups.empty) {
    const batch = adminDb.batch();
    for (const doc of groups.docs) {
      batch.update(doc.ref, {
        [`members.${session.uid}.paypalEmail`]: paypalEmail || FieldValue.delete(),
        [`members.${session.uid}.iban`]: iban || FieldValue.delete(),
      });
    }
    await batch.commit();
  }

  return { ok: true, data: null };
}
