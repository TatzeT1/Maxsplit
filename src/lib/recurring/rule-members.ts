import type { RecurringRule } from "@/lib/types";

// A recurring rule names members in its template (`paidBy`, `splits`) and the
// cron books that template as-is, month after month (see materialize.ts). So a
// rule must never name a uid that isn't in the group's `members`: the booked
// expense would give that uid a balance the group page never shows, because it
// only ever lists debts for `Object.keys(members)` — a "ghost debt".

type RuleTemplate = Pick<RecurringRule, "paidBy" | "splits">;

/** Every uid a rule's template names, as payer or participant. */
export function ruleMemberUids(rule: RuleTemplate): string[] {
  return [...new Set([...Object.keys(rule.paidBy), ...Object.keys(rule.splits)])];
}

/** Whether the rule names `uid` anywhere in its template. */
export function ruleNamesMember(rule: RuleTemplate, uid: string): boolean {
  return uid in rule.paidBy || uid in rule.splits;
}

/** Whether the rule names someone who is no longer (or never was) in `members`. */
export function ruleHasMissingMembers(
  rule: RuleTemplate,
  members: Record<string, unknown>,
): boolean {
  return ruleMemberUids(rule).some((uid) => !(uid in members));
}
