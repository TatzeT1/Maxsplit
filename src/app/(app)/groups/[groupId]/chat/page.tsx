import { ChatClient } from "@/components/groups/chat-client";
import { getSession } from "@/lib/auth/session";

export default async function GroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const session = await getSession();
  // keyed by group: moving from one group's chat to another's must start fresh,
  // not carry over its messages, draft and scroll position.
  return (
    <ChatClient
      key={groupId}
      groupId={groupId}
      initialMuted={session?.mutedChatGroupIds.includes(groupId) ?? false}
    />
  );
}
