import Link from "next/link";
import { formatDate, formatTime } from "@/lib/format/date";
import type { AdminAiCall } from "@/lib/admin/ai";
import type { AiCallKind } from "@/lib/types";

const KIND_LABELS: Record<AiCallKind, string> = {
  "receipt-scan": "📷 Receipt scan",
  classify: "📊 Classify (Jetzt einordnen)",
  "classify-auto": "📊 Classify after saving",
};

/** One line per prompt: when, what, which model answered, and the texts sent or read. */
export function AdminAiCallList({
  calls,
  groupNames,
  userNames,
}: {
  calls: AdminAiCall[];
  /** Shows the group with a link when given (the all-groups page). */
  groupNames?: Record<string, string>;
  /** uid → display name or email. */
  userNames: Record<string, string>;
}) {
  if (calls.length === 0) return <p className="text-muted-foreground text-sm">No AI calls yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {calls.map((call) => {
        const createdAt = new Date(call.createdAt);
        const fallbacks = call.attempts.filter((attempt) => !attempt.ok);
        const ms = call.attempts.reduce((sum, attempt) => sum + attempt.ms, 0);
        return (
          <li
            key={`${call.groupId}/${call.id}`}
            className="bg-card ring-foreground/10 flex flex-col gap-1 rounded-xl p-3 text-sm ring-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{KIND_LABELS[call.kind] ?? call.kind}</span>
              <span
                className={call.ok ? "text-muted-foreground text-xs" : "text-destructive text-xs"}
              >
                {call.ok ? "ok" : "failed"} · {(ms / 1000).toFixed(1)} s
              </span>
            </div>
            <div className="text-muted-foreground text-xs">
              {formatDate(createdAt)} {formatTime(createdAt)}
              {groupNames && (
                <>
                  {" · "}
                  <Link href={`/admin/groups/${call.groupId}`} className="hover:underline">
                    {groupNames[call.groupId] ?? call.groupId}
                  </Link>
                </>
              )}
              {call.uid && (
                <>
                  {" · "}
                  <Link href={`/admin/users/${call.uid}`} className="hover:underline">
                    {userNames[call.uid] ?? "user"}
                  </Link>
                </>
              )}
            </div>
            <div className="text-muted-foreground text-xs break-all">
              {call.answeredBy ?? "no answer"}
              {fallbacks.length > 0 &&
                ` · tried before: ${fallbacks.map((attempt) => `${attempt.provider} (${attempt.error ?? "failed"})`).join(", ")}`}
            </div>
            {call.summary.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer">
                  {call.summary.length} text{call.summary.length === 1 ? "" : "s"}
                </summary>
                <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                  {call.summary.join("\n")}
                </p>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
