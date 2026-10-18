// Stand-in for lib/products/classify-after in the emulator integration tests:
// the real one schedules classification with next/server's `after`, which
// throws outside a request. Tests read what an action would have classified
// from `scheduledClassifications`, and run the real classification directly.

export const scheduledClassifications: { groupId: string; expenseId: string }[] = [];

export function classifyAfterResponse(groupId: string, expenseId: string): void {
  scheduledClassifications.push({ groupId, expenseId });
}

export function clearScheduledClassifications(): void {
  scheduledClassifications.length = 0;
}
