export type GroupRole = "owner" | "admin" | "member";

export interface GroupMember {
  displayName: string;
  photoURL: string;
  joinedAt: string;
  role: GroupRole;
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
  createdAt: string;
}

/**
 * Records edit/delete history for expenses. "Added" isn't logged — the
 * expense row itself already signals that, so a log entry would just
 * duplicate it right next to the row that shows the same thing in full.
 */
export type ActivityLogType = "expense_edited" | "expense_deleted";

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
