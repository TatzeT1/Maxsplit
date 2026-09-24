import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { computeBalances } from "@/lib/money/balances";
import type {
  ChatMessage,
  Expense,
  Group,
  GroupRole,
  RecurringRule,
  Settlement,
} from "@/lib/types";

/** Chat messages are capped in the admin view the same way the chat UI itself caps them (MAX_LOADED_MESSAGES in lib/chat/constants.ts) — a group's full history could otherwise be unbounded. */
const MAX_ADMIN_CHAT_MESSAGES = 300;

export interface AdminGroupSummary {
  groupId: string;
  name: string;
  icon: string | null;
  currency: string;
  archived: boolean;
  createdAt: string;
  memberCount: number;
}

export async function listGroups(): Promise<AdminGroupSummary[]> {
  const snap = await adminDb.collection("groups").orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => {
    const group = doc.data() as Omit<Group, "id">;
    return {
      groupId: doc.id,
      name: group.name,
      icon: group.icon ?? null,
      currency: group.currency,
      archived: group.archived,
      createdAt: group.createdAt,
      memberCount: group.memberUids.length,
    };
  });
}

export interface AdminGroupMember {
  uid: string;
  displayName: string;
  role: GroupRole;
  isPlaceholder: boolean;
}

export interface AdminGroupDetail extends AdminGroupSummary {
  createdBy: string;
  inviteCode: string;
  members: AdminGroupMember[];
  expenseCount: number;
  settlementCount: number;
  /** Every expense, including soft-deleted ones (`deletedAt` set) — the admin view surfaces those too rather than hiding them like the member-facing UI does. */
  expenses: Expense[];
  settlements: Settlement[];
  recurringRules: RecurringRule[];
  /** Net balance per uid, computed fresh from the live (non-deleted) ledger — same math as `group.balancesMinor`, but never stale. */
  balancesMinor: Record<string, number>;
  /** Most recent messages, oldest first, capped at MAX_ADMIN_CHAT_MESSAGES. */
  messages: ChatMessage[];
  /** True chat message count, which may exceed `messages.length` once a group's history is longer than the cap. */
  messageCount: number;
}

export async function getGroupDetail(groupId: string): Promise<AdminGroupDetail | null> {
  const groupRef = adminDb.collection("groups").doc(groupId);
  const [groupSnap, expensesSnap, settlementsSnap, recurringSnap, messagesSnap, messagesCountSnap] =
    await Promise.all([
      groupRef.get(),
      groupRef.collection("expenses").orderBy("date", "desc").get(),
      groupRef.collection("settlements").orderBy("date", "desc").get(),
      groupRef.collection("recurring").orderBy("createdAt", "desc").get(),
      groupRef
        .collection("messages")
        .orderBy("createdAt", "desc")
        .limit(MAX_ADMIN_CHAT_MESSAGES)
        .get(),
      groupRef.collection("messages").count().get(),
    ]);
  if (!groupSnap.exists) return null;
  const group = groupSnap.data() as Omit<Group, "id">;

  const members: AdminGroupMember[] = Object.entries(group.members).map(([uid, member]) => ({
    uid,
    displayName: member.displayName,
    role: member.role,
    isPlaceholder: member.isPlaceholder === true,
  }));

  const expenses = expensesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Expense);
  const settlements = settlementsSnap.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as Settlement,
  );
  const recurringRules = recurringSnap.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as RecurringRule,
  );
  // Query comes back newest-first (for the cap to keep the *latest* messages); reverse to chronological order for display.
  const messages = messagesSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as ChatMessage)
    .reverse();

  const balancesMinor = computeBalances(
    expenses
      .filter((expense) => !expense.deletedAt)
      .map((expense) => ({
        paidBy: expense.paidBy,
        splits: Object.fromEntries(
          Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
        ),
      })),
    settlements,
  );

  return {
    groupId,
    name: group.name,
    icon: group.icon ?? null,
    currency: group.currency,
    archived: group.archived,
    createdAt: group.createdAt,
    createdBy: group.createdBy,
    inviteCode: group.inviteCode,
    memberCount: group.memberUids.length,
    members,
    expenseCount: expenses.length,
    settlementCount: settlements.length,
    expenses,
    settlements,
    recurringRules,
    balancesMinor,
    messages,
    messageCount: messagesCountSnap.data().count,
  };
}
