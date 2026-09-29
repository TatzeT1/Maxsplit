import type { GroupMember } from "@/lib/types";

/**
 * The payment fields a user sets on their own profile (`users/{uid}`, the
 * source of truth) that are copied onto every `GroupMember` entry they hold,
 * so co-members can see how to pay them back — see GroupMember in
 * lib/types.ts. Listed once so every writer of that copy (creating a group,
 * joining, claiming a placeholder, editing the profile, the admin resync)
 * covers the same fields: `paypalMeHandle` was once left out of the three
 * membership paths and never reached any group joined after it was set.
 */
export const MEMBER_PAYMENT_FIELDS = ["paypalEmail", "iban", "paypalMeHandle"] as const;

export type MemberPaymentField = (typeof MEMBER_PAYMENT_FIELDS)[number];

/** The set payment fields only — an unset field is absent, never "" or null. */
export type MemberPaymentDetails = Partial<Record<MemberPaymentField, string>>;

/** Picks the set (non-empty) payment fields from a profile doc or a Session. */
export function pickPaymentDetails(
  source: Partial<Record<MemberPaymentField, unknown>>,
): MemberPaymentDetails {
  const details: MemberPaymentDetails = {};
  for (const field of MEMBER_PAYMENT_FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value) details[field] = value;
  }
  return details;
}

/**
 * Whether a member entry's copy disagrees with the profile's details. Absent
 * and "" count as the same unset value — older member entries stored "" for
 * an unset field, newer ones leave it out.
 */
export function paymentDetailsDiffer(
  member: Partial<Pick<GroupMember, MemberPaymentField>>,
  details: MemberPaymentDetails,
): boolean {
  return MEMBER_PAYMENT_FIELDS.some((field) => (member[field] || "") !== (details[field] || ""));
}
