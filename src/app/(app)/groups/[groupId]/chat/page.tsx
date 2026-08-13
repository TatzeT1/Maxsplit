import { ChatClient } from "@/components/groups/chat-client";

export default async function GroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <ChatClient groupId={groupId} />;
}
