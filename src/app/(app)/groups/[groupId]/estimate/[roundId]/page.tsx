import { redirect } from "next/navigation";
import { EstimateRoundPageClient } from "@/components/groups/estimate-round-page-client";

// Ids go into a Firestore path; anything but a plain id can't be one.
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export default async function GroupEstimateRoundPage({
  params,
}: {
  params: Promise<{ groupId: string; roundId: string }>;
}) {
  const { groupId, roundId } = await params;
  if (!SAFE_ID.test(groupId) || !SAFE_ID.test(roundId)) redirect("/");
  return <EstimateRoundPageClient groupId={groupId} roundId={roundId} />;
}
