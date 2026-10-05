"use server";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getSession, type Session } from "@/lib/auth/session";
import { isSupportedCurrency } from "@/lib/currencies";
import { adminDb } from "@/lib/firebase/admin";
import { generateInviteCode, normalizeInviteCode } from "@/lib/groups/invite-code";
import { moveMemberInLedgerEntry } from "@/lib/groups/move-member";
import { isGroupManager } from "@/lib/groups/permissions";
import { isValidEmoji, isValidName } from "@/lib/ledger-input";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import { computeBalances } from "@/lib/money/balances";
import { pickPaymentDetails } from "@/lib/payment/member-payment-details";
import { ruleNamesMember } from "@/lib/recurring/rule-members";
import type {
  Expense,
  Group,
  GroupMember,
  GroupRole,
  RecurringRule,
  Settlement,
} from "@/lib/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * A real (non-placeholder) member entry for the caller, including the
 * denormalized copy of their payment details (see GroupMember in
 * lib/types.ts). The one place a real member is minted — creating a group,
 * joining one, claiming a placeholder — so those three can't drift apart
 * field by field again (all three once dropped `paypalMeHandle`, hiding the
 * PayPal.Me button in every group joined after the handle was set).
 */
function realMemberFromSession(
  session: Session,
  init: { role: GroupRole; joinedAt: string; fallbackDisplayName?: string },
): GroupMember {
  return {
    displayName: session.displayName ?? init.fallbackDisplayName ?? "",
    photoURL: session.photoURL ?? "",
    joinedAt: init.joinedAt,
    role: init.role,
    isPlaceholder: false,
    ...pickPaymentDetails(session),
  };
}

/**
 * A member's net balance (minor units) across the group's whole ledger, not
 * just its current members — same computation the settlement PDF uses (see
 * app/share/settlement/[groupId]/[token]/route.ts). Used to block
 * removing/leaving while unsettled: the group page's balance views (the
 * BalanceHero slip and the Salden tab) only ever name debts for
 * `Object.keys(members)`, so a member removed with a nonzero balance would
 * have their debt silently vanish from the main view even though the
 * expenses/settlements that created it are still sitting in the ledger.
 */
async function computeMemberBalance(
  groupRef: FirebaseFirestore.DocumentReference,
  uid: string,
): Promise<number> {
  const [expensesSnap, settlementsSnap] = await Promise.all([
    groupRef.collection("expenses").get(),
    groupRef.collection("settlements").get(),
  ]);

  const expenses = expensesSnap.docs
    .map((doc) => doc.data() as Expense)
    .filter((expense) => !expense.deletedAt);
  const settlements = settlementsSnap.docs.map((doc) => doc.data() as Settlement);

  const balanceExpenses = expenses.map((expense) => ({
    paidBy: expense.paidBy,
    splits: Object.fromEntries(
      Object.entries(expense.splits).map(([memberUid, split]) => [memberUid, split.amountMinor]),
    ),
  }));

  const balances = computeBalances(balanceExpenses, settlements);
  return balances[uid] ?? 0;
}

/**
 * Whether any recurring rule — active or paused, since a paused one can be
 * resumed — still names `uid` as payer or participant. Leaving or removing
 * such a member would leave the rule booking expenses on a uid the group page
 * no longer shows (a "ghost debt", see lib/recurring/rule-members.ts), so both
 * are refused until the rule is deleted.
 */
async function isNamedInRecurringRule(
  groupRef: FirebaseFirestore.DocumentReference,
  uid: string,
): Promise<boolean> {
  const rules = await groupRef.collection("recurring").get();
  return rules.docs.some((doc) => ruleNamesMember(doc.data() as RecurringRule, uid));
}

/**
 * Whether the group has anything booked in its currency: a live expense, a
 * settlement, or a recurring rule (which books in the currency it was
 * created with). Balances add these amounts at face value, so once any exist
 * the group's currency can't change — it would silently relabel 100 € as
 * "100,00 $". The group page mirrors this to disable the currency picker.
 */
async function hasLedgerEntries(groupRef: FirebaseFirestore.DocumentReference): Promise<boolean> {
  const [expenses, settlements, rules] = await Promise.all([
    groupRef.collection("expenses").where("deletedAt", "==", null).limit(1).get(),
    groupRef.collection("settlements").limit(1).get(),
    groupRef.collection("recurring").limit(1).get(),
  ]);
  return !expenses.empty || !settlements.empty || !rules.empty;
}

const MAX_INVITE_CODE_ATTEMPTS = 5;

async function findUniqueInviteCode(): Promise<string> {
  const groupsRef = adminDb.collection("groups");
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    const code = generateInviteCode();
    const existing = await groupsRef.where("inviteCode", "==", code).limit(1).get();
    if (existing.empty) return code;
  }
  throw new Error("Could not generate a unique invite code");
}

export async function createGroup(input: {
  name: string;
  currency: string;
  icon?: string | null;
  memberNames?: string[];
}): Promise<ActionResult<{ groupId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  if (!isValidName(input.name)) return { ok: false, error: "invalid-name" };
  const name = input.name.trim();
  if (!isSupportedCurrency(input.currency)) return { ok: false, error: "invalid-currency" };
  const icon = input.icon ?? null;
  if (!isValidEmoji(icon)) return { ok: false, error: "invalid-icon" };
  const memberNames = (input.memberNames ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
  if (!memberNames.every(isValidName)) return { ok: false, error: "invalid-name" };

  const inviteCode = await findUniqueInviteCode();
  const now = new Date().toISOString();

  const members: Record<string, GroupMember> = {
    [session.uid]: realMemberFromSession(session, { role: "owner", joinedAt: now }),
  };

  // Optional placeholder members entered at creation time, same shape
  // addPlaceholderMember produces later — folded into the initial write so
  // the group never exists with only its creator as a transient state.
  for (const displayName of memberNames) {
    const placeholderId = `ph_${randomUUID()}`;
    members[placeholderId] = {
      displayName,
      photoURL: "",
      joinedAt: now,
      role: "member",
      isPlaceholder: true,
    };
  }

  const group: Omit<Group, "id"> = {
    name,
    icon,
    currency: input.currency,
    createdBy: session.uid,
    createdAt: now,
    archived: false,
    memberUids: [session.uid],
    members,
    inviteCode,
  };

  const docRef = await adminDb.collection("groups").add(group);
  return { ok: true, data: { groupId: docRef.id } };
}

export async function updateGroup(input: {
  groupId: string;
  name: string;
  currency: string;
  icon?: string | null;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  if (!isValidName(input.name)) return { ok: false, error: "invalid-name" };
  const name = input.name.trim();
  const icon = input.icon ?? null;
  if (!isValidEmoji(icon)) return { ok: false, error: "invalid-icon" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  if (input.currency !== group.currency) {
    if (!isSupportedCurrency(input.currency)) return { ok: false, error: "invalid-currency" };
    if (await hasLedgerEntries(groupRef)) return { ok: false, error: "currency-locked" };
  }

  await groupRef.update({ name, currency: input.currency, icon });

  return { ok: true, data: null };
}

/**
 * Moves a group out of everyone's main list into "Archiviert" — or back. It
 * only changes where the group is shown: nothing is locked, no balance or
 * expense is touched, and the group stays reachable by its link. It's the
 * same flag the admin panel sets (`adminSetGroupArchived`), so an unarchive
 * here also undoes that.
 *
 * Archiving is refused while a recurring rule is still running. The cron
 * books into the group whether it's shown or not, and a rent booked
 * every month into a group nobody looks at any more is a debt nobody sees
 * grow. (Un-archiving is always allowed.)
 */
export async function setGroupArchived(input: {
  groupId: string;
  archived: boolean;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (typeof input.archived !== "boolean") return { ok: false, error: "invalid-archived" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  if (input.archived) {
    const running = await groupRef
      .collection("recurring")
      .where("active", "==", true)
      .limit(1)
      .get();
    if (!running.empty) return { ok: false, error: "has-active-recurring" };
  }

  await groupRef.update({ archived: input.archived });

  return { ok: true, data: null };
}

export async function addPlaceholderMember(input: {
  groupId: string;
  displayName: string;
}): Promise<ActionResult<{ placeholderId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  if (!isValidName(input.displayName)) return { ok: false, error: "invalid-name" };
  const name = input.displayName.trim();

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  // "ph_" guarantees no collision with a real Firebase Auth uid, and keeps
  // placeholder ids visually obvious in Firestore data / logs.
  const placeholderId = `ph_${randomUUID()}`;
  const placeholder: GroupMember = {
    displayName: name,
    photoURL: "",
    joinedAt: new Date().toISOString(),
    role: "member",
    isPlaceholder: true,
  };

  await groupRef.update({ [`members.${placeholderId}`]: placeholder });
  return { ok: true, data: { placeholderId } };
}

export async function renamePlaceholderMember(input: {
  groupId: string;
  uid: string;
  displayName: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  if (!isValidName(input.displayName)) return { ok: false, error: "invalid-name" };
  const name = input.displayName.trim();

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  const target = group.members[input.uid];
  if (!target || !target.isPlaceholder) return { ok: false, error: "not-found" };

  await groupRef.update({ [`members.${input.uid}.displayName`]: name });
  return { ok: true, data: null };
}

export async function previewGroupByInviteCode(input: { inviteCode: string }): Promise<
  ActionResult<{
    groupId: string;
    groupName: string;
    placeholders: { id: string; displayName: string }[];
  }>
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const code = normalizeInviteCode(input.inviteCode);
  if (!code) return { ok: false, error: "invalid-code" };

  const matches = await adminDb.collection("groups").where("inviteCode", "==", code).limit(1).get();
  if (matches.empty) return { ok: false, error: "not-found" };

  const groupDoc = matches.docs[0];
  const group = groupDoc.data() as Omit<Group, "id">;

  const placeholders = Object.entries(group.members)
    .filter(([, member]) => member.isPlaceholder)
    .map(([id, member]) => ({ id, displayName: member.displayName }));

  return { ok: true, data: { groupId: groupDoc.id, groupName: group.name, placeholders } };
}

/**
 * Rewrites every expense, recurring rule and settlement referencing
 * `placeholderId` to `session.uid` instead, so a new real member "becomes"
 * an existing placeholder rather than starting a second, disconnected
 * identity — the whole point of placeholders is that the ledger is already
 * correct once the real person shows up. Recurring rules matter as much as
 * past expenses: a rule still naming the placeholder would keep booking
 * expenses on a uid that's no longer in `members` (see rule-members.ts).
 * One batch (500-write Firestore limit) is plenty at this app's scale; this
 * isn't built to handle a group with hundreds of expenses referencing one
 * placeholder.
 */
async function claimPlaceholder(
  groupRef: FirebaseFirestore.DocumentReference,
  group: Omit<Group, "id">,
  placeholderId: string,
  session: Session,
): Promise<string | null> {
  const placeholder = group.members[placeholderId];
  if (!placeholder || !placeholder.isPlaceholder) return "invalid-placeholder";

  const batch = adminDb.batch();

  const [expensesSnap, rulesSnap] = await Promise.all([
    groupRef.collection("expenses").get(),
    groupRef.collection("recurring").get(),
  ]);
  for (const doc of [...expensesSnap.docs, ...rulesSnap.docs]) {
    const entry = doc.data() as Pick<Expense, "paidBy" | "splits">;
    const updates = moveMemberInLedgerEntry(entry, placeholderId, session.uid);
    if (updates) batch.update(doc.ref, updates);
  }

  const settlementsSnap = await groupRef.collection("settlements").get();
  for (const doc of settlementsSnap.docs) {
    const settlement = doc.data() as Settlement;
    const updates: Record<string, unknown> = {};
    if (settlement.fromUid === placeholderId) updates.fromUid = session.uid;
    if (settlement.toUid === placeholderId) updates.toUid = session.uid;
    if (Object.keys(updates).length > 0) batch.update(doc.ref, updates);
  }

  const claimedMember = realMemberFromSession(session, {
    role: placeholder.role,
    joinedAt: new Date().toISOString(),
    fallbackDisplayName: placeholder.displayName,
  });
  batch.update(groupRef, {
    memberUids: FieldValue.arrayUnion(session.uid),
    [`members.${placeholderId}`]: FieldValue.delete(),
    [`members.${session.uid}`]: claimedMember,
  });

  await batch.commit();
  await recomputeGroupBalances(groupRef);
  return null;
}

export async function joinGroupByInviteCode(input: {
  inviteCode: string;
  claimPlaceholderId?: string;
}): Promise<ActionResult<{ groupId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const code = normalizeInviteCode(input.inviteCode);
  if (!code) return { ok: false, error: "invalid-code" };

  const matches = await adminDb.collection("groups").where("inviteCode", "==", code).limit(1).get();
  if (matches.empty) return { ok: false, error: "not-found" };

  const groupDoc = matches.docs[0];
  const group = groupDoc.data() as Omit<Group, "id">;

  if (group.memberUids.includes(session.uid)) {
    return { ok: true, data: { groupId: groupDoc.id } };
  }

  if (input.claimPlaceholderId) {
    const error = await claimPlaceholder(groupDoc.ref, group, input.claimPlaceholderId, session);
    if (error) return { ok: false, error };
    return { ok: true, data: { groupId: groupDoc.id } };
  }

  const member = realMemberFromSession(session, {
    role: "member",
    joinedAt: new Date().toISOString(),
  });

  await groupDoc.ref.update({
    memberUids: FieldValue.arrayUnion(session.uid),
    [`members.${session.uid}`]: member,
  });

  return { ok: true, data: { groupId: groupDoc.id } };
}

export async function leaveGroup(input: { groupId: string }): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  const member = group.members[session.uid];
  if (!member) return { ok: false, error: "forbidden" };
  if (member.role === "owner") return { ok: false, error: "owner-cannot-leave" };

  const balance = await computeMemberBalance(groupRef, session.uid);
  if (balance !== 0) return { ok: false, error: "unsettled-balance" };
  if (await isNamedInRecurringRule(groupRef, session.uid)) {
    return { ok: false, error: "in-recurring-rule" };
  }

  await groupRef.update({
    memberUids: FieldValue.arrayRemove(session.uid),
    [`members.${session.uid}`]: FieldValue.delete(),
  });

  return { ok: true, data: null };
}

export async function deleteGroup(input: { groupId: string }): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (group.members[session.uid]?.role !== "owner") return { ok: false, error: "forbidden" };

  await adminDb.recursiveDelete(groupRef);
  return { ok: true, data: null };
}

export async function removeMember(input: {
  groupId: string;
  uid: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  const actor = group.members[session.uid];
  const target = group.members[input.uid];
  if (!actor || !target) return { ok: false, error: "forbidden" };
  if (input.uid === session.uid) return { ok: false, error: "cannot-remove-self" };
  if (target.role === "owner") return { ok: false, error: "cannot-remove-owner" };
  if (!isGroupManager(actor.role)) return { ok: false, error: "forbidden" };
  if (actor.role === "admin" && target.role === "admin") return { ok: false, error: "forbidden" };

  const balance = await computeMemberBalance(groupRef, input.uid);
  if (balance !== 0) return { ok: false, error: "unsettled-balance" };
  if (await isNamedInRecurringRule(groupRef, input.uid)) {
    return { ok: false, error: "in-recurring-rule" };
  }

  await groupRef.update({
    memberUids: FieldValue.arrayRemove(input.uid),
    [`members.${input.uid}`]: FieldValue.delete(),
  });

  return { ok: true, data: null };
}

export async function setMemberRole(input: {
  groupId: string;
  uid: string;
  role: Extract<GroupRole, "admin" | "member">;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  // The `role` type is compile-time only; a hand-crafted request can carry any
  // string. Reject anything but the two assignable roles so an owner can't
  // mint a second "owner" (breaking the owner-cannot-leave / remove-owner
  // invariants) or store a bogus role that slips past isGroupManager.
  if (input.role !== "admin" && input.role !== "member") {
    return { ok: false, error: "invalid-role" };
  }

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (group.members[session.uid]?.role !== "owner") return { ok: false, error: "forbidden" };
  if (input.uid === session.uid) return { ok: false, error: "forbidden" };

  const target = group.members[input.uid];
  if (!target) return { ok: false, error: "not-found" };
  if (target.role === "owner") return { ok: false, error: "forbidden" };

  await groupRef.update({ [`members.${input.uid}.role`]: input.role });
  return { ok: true, data: null };
}
