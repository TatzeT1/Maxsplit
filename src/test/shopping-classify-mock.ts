// Stand-in for lib/shopping/classify-after in the emulator integration tests
// (see classify-mock.ts for why): tests read what an action would have
// classified from `scheduledShoppingClassifications`.

export const scheduledShoppingClassifications: {
  groupId: string;
  listId: string;
  itemId: string;
  uid: string;
}[] = [];

export function classifyShoppingItemAfterResponse(
  groupId: string,
  listId: string,
  itemId: string,
  uid: string,
): void {
  scheduledShoppingClassifications.push({ groupId, listId, itemId, uid });
}

export function clearScheduledShoppingClassifications(): void {
  scheduledShoppingClassifications.length = 0;
}
