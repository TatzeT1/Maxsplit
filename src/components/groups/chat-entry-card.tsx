"use client";

import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/locale-provider";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import type { ChatMessage, ChatRead, GroupMember } from "@/lib/types";

export function ChatEntryCard({
  groupId,
  members,
  currentUid,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currentUid: string;
}) {
  const [latest, setLatest] = useState<ChatMessage | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    const latestQuery = query(
      collection(db, "groups", groupId, "messages"),
      orderBy("createdAt", "desc"),
      limit(1),
    );
    return onSnapshot(
      latestQuery,
      (snapshot) => {
        setLatest(
          snapshot.empty
            ? null
            : ({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ChatMessage),
        );
      },
      (error) => {
        setErrorCode(reportSnapshotError("chat-latest", error));
      },
    );
  }, [groupId]);

  useEffect(() => {
    return onSnapshot(
      doc(db, "groups", groupId, "chatReads", currentUid),
      (snapshot) => {
        setLastReadAt(snapshot.exists() ? (snapshot.data() as ChatRead).lastReadAt : null);
      },
      (error) => {
        setErrorCode(reportSnapshotError("chat-read", error));
      },
    );
  }, [groupId, currentUid]);

  const unread = latest !== null && (!lastReadAt || latest.createdAt > lastReadAt);
  const senderName = latest ? (members[latest.senderUid]?.displayName ?? "?") : null;

  return (
    <Link
      href={`/groups/${groupId}/chat`}
      className="bg-card ring-foreground/10 hover:ring-primary/40 relative flex items-center gap-3 overflow-hidden rounded-xl p-3 ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99]"
    >
      <div className="bg-primary/10 text-primary relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <MessageCircle className="h-4.5 w-4.5" />
        {unread && (
          <span className="bg-destructive ring-card absolute top-0 right-0 h-2.5 w-2.5 rounded-full ring-2" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{t("chat.title")}</span>
        {errorCode ? (
          <span className="text-destructive truncate text-xs">
            {t("errors.errorCode", { code: errorCode })}
          </span>
        ) : (
          <p className="text-muted-foreground truncate text-xs">
            {latest ? `${senderName}: ${latest.text}` : t("chat.noPreview")}
          </p>
        )}
      </div>
      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
    </Link>
  );
}
