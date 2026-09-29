import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Group } from "@/lib/types";
import {
  MEMBER_PAYMENT_FIELDS,
  paymentDetailsDiffer,
  type MemberPaymentDetails,
} from "./member-payment-details";

/**
 * Writes a user's payment details onto their member entry in every group
 * they're a real member of (`memberUids` only ever holds real, authenticated
 * members, so `members.{uid}` exists in every group this finds). Only groups
 * whose copy actually differs are written; returns how many were. Shared by
 * updatePaymentDetails (lib/actions/profile.ts) and the admin resync, so the
 * two can't disagree on which fields make up "the copy".
 */
export async function syncMemberPaymentDetails(
  uid: string,
  details: MemberPaymentDetails,
): Promise<number> {
  const groups = await adminDb
    .collection("groups")
    .where("memberUids", "array-contains", uid)
    .get();

  const stale = groups.docs.filter((doc) => {
    const member = (doc.data() as Omit<Group, "id">).members?.[uid];
    return member !== undefined && paymentDetailsDiffer(member, details);
  });
  if (stale.length === 0) return 0;

  const update = Object.fromEntries(
    MEMBER_PAYMENT_FIELDS.map((field) => [
      `members.${uid}.${field}`,
      details[field] ?? FieldValue.delete(),
    ]),
  );
  const batch = adminDb.batch();
  for (const doc of stale) batch.update(doc.ref, update);
  await batch.commit();
  return stale.length;
}
