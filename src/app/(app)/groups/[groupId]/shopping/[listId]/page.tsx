import { ShoppingListClient } from "@/components/shopping/shopping-list-client";

export default async function ShoppingListPage({
  params,
}: {
  params: Promise<{ groupId: string; listId: string }>;
}) {
  const { groupId, listId } = await params;
  // Keyed by list: moving from one list to another must start fresh, not carry
  // over the half-typed entry and the adds still on their way.
  return <ShoppingListClient key={`${groupId}/${listId}`} groupId={groupId} listId={listId} />;
}
