"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";
import { MemberAvatarStack } from "@/components/groups/member-avatar-stack";
import { useT } from "@/components/locale-provider";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import {
  type BalanceSummary,
  partitionArchived,
  sortGroupsForList,
  summarizeBalances,
} from "@/lib/groups/overview";
import { avatarGradient, cn } from "@/lib/utils";
import type { Group } from "@/lib/types";

/**
 * Reads the cached `balancesMinor` (see types.ts) written by
 * recomputeGroupBalances — never recomputed here from the ledger, since that
 * would mean subscribing to every group's full expense subcollection just to
 * render a list. Renders nothing for a group created before that field
 * existed; it fills in on that group's next expense/settlement mutation.
 */
function GroupBalanceBadge({ group, uid }: { group: Group; uid: string }) {
  const t = useT();
  const amountMinor = group.balancesMinor?.[uid];
  if (amountMinor === undefined) return null;

  if (amountMinor === 0) {
    return (
      <span className="text-success shrink-0 text-xs font-medium">
        {t("groups.balanceSettled")}
      </span>
    );
  }

  const isOwedToYou = amountMinor > 0;
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-end gap-0.5",
        isOwedToYou ? "text-success" : "text-destructive",
      )}
    >
      <span className="font-heading tabular-money text-sm font-semibold">
        {formatMoney(Math.abs(amountMinor), group.currency)}
      </span>
      <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
        {isOwedToYou ? t("groups.balanceOwedToYouLabel") : t("groups.balanceYouOweLabel")}
      </span>
    </div>
  );
}

function GroupCard({ group, uid, index }: { group: Group; uid: string; index: number }) {
  const t = useT();

  return (
    <li className="animate-rise" style={{ "--stagger": Math.min(index, 8) } as CSSProperties}>
      <Link
        href={`/groups/${group.id}`}
        className="group bg-card ring-foreground/10 hover:ring-primary/40 shadow-e1 hover:shadow-e2 active:shadow-e1 ease-spring relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 ring-1 transition-[transform,box-shadow,--tw-ring-color] duration-(--duration-fast) hover:-translate-y-0.5 active:scale-[0.995]"
      >
        <div
          className={`absolute inset-0 bg-linear-to-br ${avatarGradient(group.name)} opacity-[0.06] transition-opacity duration-200 group-hover:opacity-[0.12]`}
        />
        <div
          className={`bg-linear-to-br ${avatarGradient(group.name)} ring-card shadow-e1 relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white ring-2`}
        >
          {group.icon || group.name.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate font-medium">{group.name}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MemberAvatarStack members={group.members} />
            <span className="text-muted-foreground text-xs">
              {group.memberUids.length === 1
                ? t("groups.memberCountSingular")
                : t("groups.membersCount", { count: group.memberUids.length })}
            </span>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 font-medium">
              {group.currency}
            </span>
            <span>{t("groups.createdOn", { date: formatDate(new Date(group.createdAt)) })}</span>
          </div>
        </div>
        <GroupBalanceBadge group={group} uid={uid} />
        <ChevronRight className="text-muted-foreground group-hover:text-primary relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/**
 * Where you stand over every group, per currency. Credits and debts are two
 * figures, not one net one: the 40 € you're owed in one group doesn't pay the
 * 25 € you owe in another.
 */
function GroupsTotals({ summary }: { summary: BalanceSummary }) {
  const t = useT();
  if (summary.byCurrency.length === 0 && summary.unknownCount === 0) return null;

  return (
    <section
      aria-label={t("groups.totalsTitle")}
      className="bg-card ring-foreground/10 shadow-e1 flex flex-col gap-3 rounded-2xl p-4 ring-1"
    >
      <h2 className="text-muted-foreground font-mono text-[11px] tracking-[0.14em] uppercase">
        {t("groups.totalsTitle")}
      </h2>
      {summary.byCurrency.map(({ currency, owedToYouMinor, youOweMinor }) => (
        <dl key={currency} className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("groups.balanceOwedToYouLabel")}</dt>
            <dd
              className={cn(
                "font-heading tabular-money text-lg font-semibold",
                owedToYouMinor > 0 ? "text-success" : "text-muted-foreground",
              )}
            >
              {formatMoney(owedToYouMinor, currency)}
            </dd>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <dt className="text-muted-foreground text-xs">{t("groups.balanceYouOweLabel")}</dt>
            <dd
              className={cn(
                "font-heading tabular-money text-lg font-semibold",
                youOweMinor > 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {formatMoney(youOweMinor, currency)}
            </dd>
          </div>
        </dl>
      ))}
      {summary.unknownCount > 0 && (
        <p className="text-muted-foreground text-xs">{t("groups.totalsUnknown")}</p>
      )}
    </section>
  );
}

/** Folded away by default — archived groups are out of the way, not gone — but open when nothing else is left to show. */
function ArchivedSection({
  groups,
  uid,
  defaultOpen,
}: {
  groups: Group[];
  uid: string;
  defaultOpen: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="archived-groups"
        onClick={() => setOpen((value) => !value)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex min-h-11 w-fit touch-manipulation items-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-3"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-90")}
        />
        {t("groups.archivedSection", { count: groups.length })}
      </button>
      {open && (
        <ul id="archived-groups" className="flex flex-col gap-3">
          {groups.map((group, index) => (
            <GroupCard key={group.id} group={group} uid={uid} index={index} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The groups list: your totals over all groups, then the groups themselves —
 * those with something open first — and, folded below, the archived ones.
 * Pure display; `app/(app)/groups/page.tsx` owns the listener.
 */
export function GroupsOverview({ groups, uid }: { groups: Group[]; uid: string }) {
  const t = useT();
  const summary = useMemo(() => summarizeBalances(groups, uid), [groups, uid]);
  const { active, archived } = useMemo(
    () => partitionArchived(sortGroupsForList(groups, uid)),
    [groups, uid],
  );

  return (
    <>
      <GroupsTotals summary={summary} />
      {active.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {active.map((group, index) => (
            <GroupCard key={group.id} group={group} uid={uid} index={index} />
          ))}
        </ul>
      ) : (
        archived.length > 0 && (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
            {t("groups.allArchived")}
          </p>
        )
      )}
      {archived.length > 0 && (
        <ArchivedSection groups={archived} uid={uid} defaultOpen={active.length === 0} />
      )}
    </>
  );
}
