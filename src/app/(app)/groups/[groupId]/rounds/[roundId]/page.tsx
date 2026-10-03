import { LuckRoundPageClient } from "@/components/groups/luck-round-page-client";

export default async function GroupLuckRoundPage({
  params,
}: {
  params: Promise<{ groupId: string; roundId: string }>;
}) {
  const { groupId, roundId } = await params;
  return <LuckRoundPageClient groupId={groupId} roundId={roundId} />;
}
