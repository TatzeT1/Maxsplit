import { ShoppingListsClient } from "@/components/shopping/shopping-lists-client";

export default async function ShoppingListsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <ShoppingListsClient key={groupId} groupId={groupId} />;
}
