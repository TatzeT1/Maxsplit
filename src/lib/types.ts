export interface GroupMember {
  displayName: string;
  photoURL: string;
  joinedAt: string;
  role: "owner" | "member";
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
