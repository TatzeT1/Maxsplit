"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { useT } from "@/components/locale-provider";
import { formatMoney } from "@/lib/format/money";
import {
  type BalanceSummary,
  partitionArchived,
  sortGroupsForList,
  summarizeBalances,
} from "@/lib/groups/overview";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/types";
import { monogramVars } from "@/components/ui/monogram";
import { StyleHero } from "@/components/groups/style-hero";

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
      <span className="text-muted-foreground shrink-0 text-xs">{t("groups.balanceSettled")}</span>
    );
  }

  const isOwedToYou = amountMinor > 0;
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <span
        className={cn(
          "tabular-money text-[0.95rem] font-medium",
          isOwedToYou ? "text-success" : "text-destructive",
        )}
      >
        {isOwedToYou ? "+" : "−"}
        {formatMoney(Math.abs(amountMinor), group.currency)}
      </span>
      <span className="text-muted-foreground text-[11px]">
        {isOwedToYou ? t("groups.balanceOwedToYouLabel") : t("groups.balanceYouOweLabel")}
      </span>
    </div>
  );
}

/** One row of the grouped list: a tile, the name, who's in it, and where you stand. */
function GroupRow({ group, uid, index }: { group: Group; uid: string; index: number }) {
  const t = useT();

  return (
    <li className="animate-rise" style={{ "--stagger": Math.min(index, 8) + 2 } as CSSProperties}>
      <Link
        href={`/groups/${group.id}`}
        className="group hover:bg-muted/60 active:bg-muted focus-visible:bg-muted flex min-h-16 items-center gap-3.5 px-4 py-3 transition-colors duration-(--duration-fast) outline-none"
      >
        <div
          style={monogramVars(group.name)}
          className="monogram flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.8rem] text-lg font-medium"
        >
          {group.icon || group.name.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{group.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {group.memberUids.length === 1
              ? t("groups.memberCountSingular")
              : t("groups.membersCount", { count: group.memberUids.length })}
            {" · "}
            {group.currency}
          </span>
        </div>
        <GroupBalanceBadge group={group} uid={uid} />
        <ChevronRight className="text-muted-foreground/60 group-hover:text-foreground h-4 w-4 shrink-0 transition-[color,transform] duration-(--duration-fast) group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/** The grouped list: one surface, hairlines between rows. */
function GroupList({ groups, uid, id }: { groups: Group[]; uid: string; id?: string }) {
  return (
    <ul
      id={id}
      className="bg-card shadow-e1 divide-border flex flex-col divide-y overflow-hidden rounded-2xl"
    >
      {groups.map((group, index) => (
        <GroupRow key={group.id} group={group} uid={uid} index={index} />
      ))}
    </ul>
  );
}

/**
 * Where you stand over every group, per currency — the first thing on screen
 * when the app opens, so it is set as one large figure on the page itself,
 * not a card. Credits and debts stay two figures, not one net one: the 40 €
 * you're owed in one group doesn't pay the 25 € you owe in another. The
 * larger of the two is the headline; the other sits beneath it.
 */
function GroupsTotals({ summary, groupCount }: { summary: BalanceSummary; groupCount: number }) {
  const t = useT();
  if (summary.byCurrency.length === 0 && summary.unknownCount === 0) return null;

  return (
    <section aria-label={t("groups.totalsTitle")} className="flex flex-col gap-6 pt-2 pb-1">
      <h2 className="text-muted-foreground animate-rise text-xs font-medium tracking-[0.12em] uppercase">
        {t("groups.totalsTitle")}
      </h2>
      {summary.byCurrency.map(({ currency, owedToYouMinor, youOweMinor }, index) => {
        const leadIsOwed = owedToYouMinor >= youOweMinor;
        const lead = leadIsOwed
          ? {
              label: t("groups.balanceOwedToYouLabel"),
              minor: owedToYouMinor,
              tone: "text-success",
            }
          : { label: t("groups.balanceYouOweLabel"), minor: youOweMinor, tone: "text-destructive" };
        const rest = leadIsOwed
          ? { label: t("groups.balanceYouOweLabel"), minor: youOweMinor, tone: "text-destructive" }
          : {
              label: t("groups.balanceOwedToYouLabel"),
              minor: owedToYouMinor,
              tone: "text-success",
            };
        return (
          <dl
            key={currency}
            className="animate-rise flex flex-col gap-3"
            style={{ "--stagger": index + 1 } as CSSProperties}
          >
            <StyleHero
              label={lead.label}
              figure={formatMoney(lead.minor, currency)}
              dotClassName={lead.minor > 0 ? lead.tone : "text-muted-foreground"}
              groupCount={groupCount}
            />
            <div className="text-muted-foreground flex items-baseline gap-1.5 text-sm">
              <dt>{rest.label}</dt>
              <dd className={cn("tabular-money font-medium", rest.minor > 0 && rest.tone)}>
                {formatMoney(rest.minor, currency)}
              </dd>
              {summary.byCurrency.length === 1 && (
                <span aria-hidden="true" className="before:mr-1.5 before:content-['·']">
                  {groupCount === 1
                    ? t("groups.acrossOneGroup")
                    : t("groups.acrossGroups", { count: groupCount })}
                </span>
              )}
            </div>
          </dl>
        );
      })}
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
      {open && <GroupList id="archived-groups" groups={groups} uid={uid} />}
    </section>
  );
}

/**
 * The groups list: your totals over all groups, then the groups themselves —
 * those with something open first — and, folded below, the archived ones.
 * Pure display; `app/(app)/groups/page.tsx` owns the listener.
 */
export function GroupsOverview({
  groups,
  uid,
  heading,
  actions,
}: {
  groups: Group[];
  uid: string;
  /** The list's heading, set between totals and list. */
  heading?: ReactNode;
  /** Create/join, set right under the list. */
  actions?: ReactNode;
}) {
  const t = useT();
  const summary = useMemo(() => summarizeBalances(groups, uid), [groups, uid]);
  const { active, archived } = useMemo(
    () => partitionArchived(sortGroupsForList(groups, uid)),
    [groups, uid],
  );

  return (
    <>
      <GroupsTotals summary={summary} groupCount={groups.length} />
      {heading}
      {active.length > 0 ? (
        <GroupList groups={active} uid={uid} />
      ) : (
        archived.length > 0 && (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
            {t("groups.allArchived")}
          </p>
        )
      )}
      {actions}
      {archived.length > 0 && (
        <ArchivedSection groups={archived} uid={uid} defaultOpen={active.length === 0} />
      )}
    </>
  );
}
