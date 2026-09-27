import { TournamentPageClient } from "@/components/groups/tournament-page-client";

export default async function GroupTournamentPage({
  params,
}: {
  params: Promise<{ groupId: string; tournamentId: string }>;
}) {
  const { groupId, tournamentId } = await params;
  return <TournamentPageClient groupId={groupId} tournamentId={tournamentId} />;
}
