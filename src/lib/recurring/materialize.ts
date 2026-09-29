import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import { expensePushes } from "@/lib/push/messages";
import { notifyAfterResponse } from "@/lib/push/notify";
import type { PendingPush } from "@/lib/push/types";
import { ruleHasMissingMembers } from "@/lib/recurring/rule-members";
import { addPeriod } from "@/lib/recurring/schedule";
import type { Expense, Group, RecurringRule } from "@/lib/types";

const MAX_CATCH_UP_RUNS = 24;

/**
 * The id of the expense a rule books for the period dated `date`. Derived
 * rather than random, so one period can only ever exist once: an overlapping
 * or retried cron run finds the doc already there instead of adding a
 * duplicate, and a booking someone soft-deleted stays deleted.
 */
export function recurringExpenseId(ruleId: string, date: string): string {
  return `rec_${ruleId}_${date}`;
}

function expenseFromRule(rule: Omit<RecurringRule, "id">, date: string): Omit<Expense, "id"> {
  const now = new Date().toISOString();
  return {
    description: rule.description,
    amountMinor: rule.amountMinor,
    currency: rule.currency,
    date,
    category: rule.category,
    paidBy: rule.paidBy,
    splitMode: rule.splitMode,
    splits: rule.splits,
    createdBy: rule.createdBy,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Books one due period of a rule, if any: one transaction reads the rule,
 * creates that period's expense and advances `nextRunDate`, so the two
 * commit together or not at all. (They used to be separate writes — a run
 * that died between them re-booked the same period the next day.)
 */
async function bookNextPeriod(
  ruleRef: FirebaseFirestore.DocumentReference,
  today: string,
): Promise<
  | { outcome: "booked"; expenseId: string; expense: Omit<Expense, "id"> }
  | { outcome: "already-booked" | "nothing-due" }
> {
  return adminDb.runTransaction(async (tx) => {
    const ruleSnap = await tx.get(ruleRef);
    if (!ruleSnap.exists) return { outcome: "nothing-due" };
    const rule = ruleSnap.data() as Omit<RecurringRule, "id">;
    if (!rule.active || rule.nextRunDate > today) return { outcome: "nothing-due" };

    const expensesRef = ruleRef.parent.parent!.collection("expenses");
    const expenseRef = expensesRef.doc(recurringExpenseId(ruleRef.id, rule.nextRunDate));
    const existing = await tx.get(expenseRef);
    const expense = expenseFromRule(rule, rule.nextRunDate);

    if (!existing.exists) tx.create(expenseRef, expense);
    tx.update(ruleRef, {
      nextRunDate: addPeriod(rule.nextRunDate, rule.startDate, rule.frequency),
    });
    return existing.exists
      ? { outcome: "already-booked" }
      : { outcome: "booked", expenseId: expenseRef.id, expense };
  });
}

/**
 * Materializes every active recurring rule whose nextRunDate has arrived
 * into a real Expense, then advances nextRunDate. Catches up on missed runs
 * (e.g. the cron didn't fire for a while) up to MAX_CATCH_UP_RUNS periods per
 * rule, so a long outage can't spawn an unbounded backlog of expenses.
 *
 * A rule that names someone no longer in the group is paused instead of
 * booked: its expense would give that uid a balance the group page can't
 * show (see rule-members.ts). Pausing surfaces it as "Pausiert" in the UI,
 * and resuming it is refused with an explanation (setRecurringRuleActive).
 *
 * Every group that got a new expense has its `balancesMinor` cache
 * recomputed, exactly as the Server Actions do after a write — without it,
 * the groups list showed a stale "du schuldest …" until someone's next edit.
 *
 * Everyone a booking touches gets a "Neue Ausgabe mit dir" push, sent after
 * the cron's response like every other push (lib/push/notify.ts).
 *
 * Runs with the Admin SDK on a schedule (Vercel Cron -> route handler), not
 * per-user like the Server Actions in src/lib/actions — there is no session
 * to check here, only the route handler's shared-secret guard.
 */
export async function materializeDueRecurringRules(
  today: string,
): Promise<{ created: number; paused: number }> {
  let created = 0;
  let paused = 0;
  const pushes: PendingPush[] = [];
  const groupsSnap = await adminDb.collection("groups").get();

  for (const groupDoc of groupsSnap.docs) {
    const group = groupDoc.data() as Omit<Group, "id">;
    const rulesSnap = await groupDoc.ref.collection("recurring").where("active", "==", true).get();
    let createdInGroup = 0;

    for (const ruleDoc of rulesSnap.docs) {
      const rule = ruleDoc.data() as Omit<RecurringRule, "id">;
      if (rule.nextRunDate > today) continue;

      if (ruleHasMissingMembers(rule, group.members ?? {})) {
        await ruleDoc.ref.update({ active: false });
        paused++;
        console.warn(
          `Paused recurring rule ${groupDoc.id}/${ruleDoc.id}: it names someone who is no longer a member`,
        );
        continue;
      }

      for (let run = 0; run < MAX_CATCH_UP_RUNS; run++) {
        const result = await bookNextPeriod(ruleDoc.ref, today);
        if (result.outcome === "nothing-due") break;
        if (result.outcome !== "booked") continue;
        createdInGroup++;
        pushes.push(
          ...expensePushes({
            groupId: groupDoc.id,
            group,
            expenseId: result.expenseId,
            expense: result.expense,
            origin: "recurring",
            actorUid: null,
          }),
        );
      }
    }

    if (createdInGroup > 0) await recomputeGroupBalances(groupDoc.ref);
    created += createdInGroup;
  }

  notifyAfterResponse(pushes);
  return { created, paused };
}
