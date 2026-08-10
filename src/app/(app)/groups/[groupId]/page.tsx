import { GroupDetailClient } from "@/components/groups/group-detail-client";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupDetailClient groupId={groupId} />;
}
