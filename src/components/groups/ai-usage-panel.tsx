"use client";

import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState, type ReactNode } from "react";
import { SectionHeading } from "@/components/groups/section-heading";
import { useT } from "@/components/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { aiUsageMonth, effectiveAiLimit } from "@/lib/ai/limits";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { formatDate, formatTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import type { AiCall, AiCallKind, Group, GroupAiUsage } from "@/lib/types";

const RECENT_CALLS = 10;

type Loaded<T> = { value: T; fromCache: boolean } | null;

/**
 * The group's AI prompts this month against its limit, and the latest ones —
 * for the group's owner and admins (rules let only them read it). Read only:
 * the limit itself is the app admin's (adminSetGroupAiLimit).
 */
export function AiUsagePanel({ group }: { group: Group }) {
  const t = useT();
  const [month] = useState(() => aiUsageMonth());
  const [used, setUsed] = useState<Loaded<number>>(null);
  const [calls, setCalls] = useState<Loaded<AiCall[]>>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(db, "groups", group.id, "aiUsage", month),
      { includeMetadataChanges: true },
      (snapshot) => {
        setUsed({
          value: (snapshot.data() as GroupAiUsage | undefined)?.count ?? 0,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => setErrorCode(reportSnapshotError("ai-usage", error)),
    );
  }, [group.id, month]);

  useEffect(() => {
    return onSnapshot(
      query(
        collection(db, "groups", group.id, "aiCalls"),
        orderBy("createdAt", "desc"),
        limit(RECENT_CALLS),
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        setCalls({
          value: snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AiCall),
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => setErrorCode(reportSnapshotError("ai-calls", error)),
    );
  }, [group.id]);

  const kindLabel: Record<AiCallKind, string> = {
    "receipt-scan": t("aiUsage.kindScan"),
    classify: t("aiUsage.kindClassify"),
    "classify-auto": t("aiUsage.kindClassifyAuto"),
  };
  const limitValue = effectiveAiLimit(group);
  // A cache that never saw the server must not pass for "no requests yet".
  const notSynced =
    used !== null &&
    calls !== null &&
    used.fromCache &&
    calls.fromCache &&
    used.value === 0 &&
    calls.value.length === 0;

  let body: ReactNode;
  if (errorCode) {
    body = <p className="text-destructive text-sm">{t("aiUsage.loadError")}</p>;
  } else if (used === null || calls === null) {
    body = <Skeleton className="h-16 w-full rounded-xl" />;
  } else if (notSynced) {
    body = <p className="text-muted-foreground text-sm">{t("aiUsage.notSynced")}</p>;
  } else {
    const spent = limitValue > 0 && used.value >= limitValue;
    body = (
      <>
        {limitValue === 0 ? (
          <p className="text-destructive text-sm">{t("aiUsage.blocked")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium tabular-nums">
              {t("aiUsage.used", { used: String(used.value), limit: String(limitValue) })}
            </p>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full", spent ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(100, (used.value / limitValue) * 100)}%` }}
              />
            </div>
            {spent && <p className="text-destructive text-xs">{t("aiUsage.spent")}</p>}
          </div>
        )}
        {calls.value.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("aiUsage.empty")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs">{t("aiUsage.recentTitle")}</p>
            <ul className="flex flex-col gap-1.5">
              {calls.value.map((call) => {
                const createdAt = new Date(call.createdAt);
                const who = call.uid ? group.members[call.uid]?.displayName : null;
                return (
                  <li key={call.id} className="flex flex-col text-sm">
                    <span className="flex justify-between gap-2">
                      <span className="truncate">
                        {kindLabel[call.kind] ?? call.kind}
                        {who && <span className="text-muted-foreground"> · {who}</span>}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatDate(createdAt)} {formatTime(createdAt)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "truncate text-xs",
                        call.ok ? "text-muted-foreground" : "text-destructive",
                      )}
                    >
                      {call.ok ? call.summary.slice(0, 4).join(", ") : t("aiUsage.failed")}
                      {call.ok &&
                        call.summary.length > 4 &&
                        ` … (${t("aiUsage.texts", { count: String(call.summary.length) })})`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>{t("aiUsage.title")}</SectionHeading>
      <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1">
        <p className="text-muted-foreground text-sm text-pretty">{t("aiUsage.body")}</p>
        {body}
      </div>
    </section>
  );
}
