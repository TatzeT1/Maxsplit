export type GroupRole = "owner" | "admin" | "member";

export interface GroupMember {
  displayName: string;
  photoURL: string;
  joinedAt: string;
  role: GroupRole;
  /**
   * True for a member added by name only, with no Firebase Auth account
   * behind them yet — lets a group's expenses/balances be correct before
   * everyone has actually joined. Never present in `memberUids` (that array
   * is real, authenticated members only, since it's what Firestore rules
   * check). Absent (not just false) on every member created before this
   * field existed; always read it as `member.isPlaceholder === true`; never
   * assume the field exists.
   */
  isPlaceholder: boolean;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  createdBy: string;
  createdAt: string;
  archived: boolean;
  memberUids: string[];
  members: Record<string, GroupMember>;
  inviteCode: string;
  /**
   * Opaque token gating the public, unauthenticated settlement PDF link
   * (see /share/settlement/[groupId]/[token]). Generated lazily on first
   * request — absent until then, never regenerated automatically.
   */
  settlementShareToken?: string;
}

export interface ExpenseSplit {
  rawValue: number;
  amountMinor: number;
}

export type SplitMode = "equal" | "shares" | "percent" | "exact";

export type CategoryId =
  | "groceries"
  | "restaurant"
  | "transport"
  | "housing"
  | "utilities"
  | "entertainment"
  | "travel"
  | "shopping"
  | "health"
  | "other";

export interface Expense {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: CategoryId | null;
  /** User-chosen override shown instead of the category icon. Absent on expenses created before this field existed. */
  emoji?: string | null;
  paidBy: Record<string, number>;
  splitMode: SplitMode;
  splits: Record<string, ExpenseSplit>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Settlement {
  id: string;
  fromUid: string;
  toUid: string;
  amountMinor: number;
  currency: string;
  date: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Records edit/delete history for expenses and settlements. "Added" isn't
 * logged — the row itself already signals that, so a log entry would just
 * duplicate it right next to the row that shows the same thing in full.
 */
export type ActivityLogType =
  "expense_edited" | "expense_deleted" | "settlement_edited" | "settlement_deleted";

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  actorUid: string;
  description: string;
  createdAt: string;
}

export type RecurringFrequency = "weekly" | "monthly";

export interface RecurringRule {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  category: CategoryId | null;
  paidBy: Record<string, number>;
  splitMode: SplitMode;
  splits: Record<string, ExpenseSplit>;
  frequency: RecurringFrequency;
  /** Immutable anchor date — its day-of-month is what monthly rollovers target. */
  startDate: string;
  /** Mutates forward each time the rule materializes an expense. */
  nextRunDate: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}
