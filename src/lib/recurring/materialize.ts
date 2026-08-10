import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { addPeriod } from "@/lib/recurring/schedule";
import type { Expense, RecurringRule } from "@/lib/types";

const MAX_CATCH_UP_RUNS = 24;

/**
 * Materializes every active recurring rule whose nextRunDate has arrived
 * into a real Expense, then advances nextRunDate. Catches up on missed runs
 * (e.g. the cron didn't fire for a while) up to MAX_CATCH_UP_RUNS periods per
 * rule, so a long outage can't spawn an unbounded backlog of expenses.
 *
 * Runs with the Admin SDK on a schedule (Vercel Cron -> route handler), not
 * per-user like the Server Actions in src/lib/actions — there is no session
 * to check here, only the route handler's shared-secret guard.
 */
export async function materializeDueRecurringRules(today: string): Promise<{ created: number }> {
  let created = 0;
  const groupsSnap = await adminDb.collection("groups").get();

  for (const groupDoc of groupsSnap.docs) {
    const rulesSnap = await groupDoc.ref.collection("recurring").where("active", "==", true).get();

    for (const ruleDoc of rulesSnap.docs) {
      const rule = ruleDoc.data() as Omit<RecurringRule, "id">;
      let nextRunDate = rule.nextRunDate;
      let runs = 0;

      while (nextRunDate <= today && runs < MAX_CATCH_UP_RUNS) {
        const now = new Date().toISOString();
        const expense: Omit<Expense, "id"> = {
          description: rule.description,
          amountMinor: rule.amountMinor,
          currency: rule.currency,
          date: nextRunDate,
          category: rule.category,
          paidBy: rule.paidBy,
          splitMode: rule.splitMode,
          splits: rule.splits,
          createdBy: rule.createdBy,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await groupDoc.ref.collection("expenses").add(expense);
        created++;
        nextRunDate = addPeriod(nextRunDate, rule.startDate, rule.frequency);
        runs++;
      }

      if (nextRunDate !== rule.nextRunDate) {
        await ruleDoc.ref.update({ nextRunDate });
      }
    }
  }

  return { created };
}
