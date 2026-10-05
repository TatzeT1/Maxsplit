"use client";

import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, ArrowLeftRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/groups/activity-feed";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { ArchivedBanner } from "@/components/groups/archive-group";
import { BalanceHero } from "@/components/groups/balance-hero";
import { BalancesTab } from "@/components/groups/balances-tab";
import { ChatEntryCard } from "@/components/groups/chat-entry-card";
import { GamesTab } from "@/components/groups/games-tab";
import { StartGameButton } from "@/components/groups/start-game-button";
import { GroupSettingsTab } from "@/components/groups/group-settings-tab";
import { MemberAvatarStack } from "@/components/groups/member-avatar-stack";
import { RecordSettlementDialog } from "@/components/groups/record-settlement-dialog";
import { LuckRoundBanner } from "@/components/groups/luck-round-banner";
import { TournamentBanner } from "@/components/groups/tournament-banner";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { isGroupManager } from "@/lib/groups/permissions";
import { computeBalances, type BalanceExpense } from "@/lib/money/balances";
import { useScreenSync } from "@/lib/offline/sync-marks";
import { useLiveSources } from "@/lib/offline/use-live-sources";
import { useOnline } from "@/lib/use-online";
import { avatarGradient, cn } from "@/lib/utils";
import type { ActivityLogEntry, Expense, Group, RecurringRule, Settlement } from "@/lib/types";

const TABS = ["expenses", "balances", "games", "group"] as const;
const LIVE_SOURCES = ["group", "expenses", "settlements", "activityLog", "recurring"] as const;
type GroupTab = (typeof TABS)[number];
const DEFAULT_TAB: GroupTab = "expenses";

function parseTab(value: string | null): GroupTab {
  return TABS.includes(value as GroupTab) ? (value as GroupTab) : DEFAULT_TAB;
}

/**
 * Tracks whether a sticky element has left its natural position, by watching
 * a zero-height sentinel placed right above it: once the sentinel scrolls
 * above the viewport, the element is pinned. Drives the tab bar's backdrop,
 * which would otherwise draw a visible band across the page while the bar is
 * still sitting in the flow.
 *
 * Takes the element itself (from a callback ref), not a ref object: the
 * sentinel only mounts once the page has left its loading skeleton, and an
 * effect keyed on a ref object would have run — and bailed — long before.
 */
function useIsPinned(sentinel: HTMLElement | null) {
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) =>
      setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);
  return pinned;
}

/**
 * A group's page, ordered by how often each thing is needed: your own
 * balance first, then the ledger, with everything else one tab away.
 *
 * It used to be ten sections of equal weight in one column, with the
 * expenses last — below member management, recurring rules and two
 * statistics cards, roughly three phone screens down. Now:
 *
 *   header        who and how many
 *   BalanceHero   where you stand, and the actions that settle it
 *   banner/chat   the two live things: a running tournament, new messages
 *   tabs          Ausgaben (default) · Salden · Spiele · Gruppe
 *   action bar    "Ausgabe hinzufügen", pinned under the thumb
 *
 * The tab lives in `?tab=` (replaced, not pushed — switching tabs isn't a
 * navigation you'd want Back to walk through), so returning from the chat or
 * an expense link lands on the tab you left.
 */
export function GroupDetailClient({ groupId }: { groupId: string }) {
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[] | null>(null);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [tabsSentinel, setTabsSentinel] = useState<HTMLDivElement | null>(null);
  const tabsPinned = useIsPinned(tabsSentinel);
  const online = useOnline();
  const { live, received, report } = useLiveSources(LIVE_SOURCES);
  const syncedAt = useScreenSync(user ? `${user.uid}:group:${groupId}` : null, live);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      { includeMetadataChanges: true },
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
        report("group", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("group", error));
      },
    );
  }, [groupId, user, report]);

  useEffect(() => {
    if (!user) return;
    const expensesQuery = query(
      collection(db, "groups", groupId, "expenses"),
      orderBy("date", "desc"),
    );
    return onSnapshot(
      expensesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setExpenses(
          snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Expense)
            .filter((expense) => !expense.deletedAt),
        );
        report("expenses", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("expenses", error));
      },
    );
  }, [groupId, user, report]);

  useEffect(() => {
    if (!user) return;
    const settlementsQuery = query(
      collection(db, "groups", groupId, "settlements"),
      orderBy("date", "desc"),
    );
    return onSnapshot(
      settlementsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setSettlements(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Settlement));
        report("settlements", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("settlements", error));
      },
    );
  }, [groupId, user, report]);

  useEffect(() => {
    if (!user) return;
    const activityLogQuery = query(
      collection(db, "groups", groupId, "activityLog"),
      orderBy("createdAt", "desc"),
      limit(30),
    );
    return onSnapshot(
      activityLogQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setActivityLog(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ActivityLogEntry));
        report("activityLog", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("activityLog", error));
      },
    );
  }, [groupId, user, report]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "groups", groupId, "recurring"),
      { includeMetadataChanges: true },
      (snapshot) => {
        setRecurringRules(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as RecurringRule));
        report("recurring", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("recurring", error));
      },
    );
  }, [groupId, user, report]);

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (parseTab(next) === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", next);
    const search = params.toString();
    window.history.replaceState(null, "", search ? `${pathname}?${search}` : pathname);

    // Switching from deep inside a long tab would otherwise leave the new
    // tab's top scrolled out of sight (or clamp the page somewhere random if
    // it's shorter). Put the tab bar back at the top, where it sits pinned.
    if (tabsSentinel && tabsSentinel.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: window.scrollY + tabsSentinel.getBoundingClientRect().top });
    }
  }

  if (user && errorCode) {
    return (
      <div className="mx-auto w-full max-w-lg p-4">
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
        </div>
      </div>
    );
  }

  // Offline without this group's ledger on this device — never opened here,
  // or its document gone from the cache: say so, rather than let an empty
  // cache pass for "Alle sind quitt" or leave a skeleton that never resolves.
  if (user && !online && !live && (syncedAt === null || (received("group") && !group))) {
    return <NeedsConnection body={t("offline.groupNotSynced")} />;
  }

  if (
    !group ||
    expenses === null ||
    settlements === null ||
    activityLog === null ||
    recurringRules === null ||
    !user
  ) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <Skeleton className="h-12 w-12 shrink-0 rounded-2xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const balanceExpenses: BalanceExpense[] = expenses.map((expense) => ({
    paidBy: expense.paidBy,
    splits: Object.fromEntries(
      Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
    ),
  }));
  const balances = computeBalances(balanceExpenses, settlements);
  const memberCount = Object.keys(group.members).length;

  return (
    // `group/page` scopes the has-focus rule on the action bar below. No
    // overflow clipping here: it would make this box the scroll container and
    // quietly turn every `sticky` inside it off.
    <div className="group/page relative flex flex-1 flex-col">
      <AmbientBackdrop tint={avatarGradient(group.name)} />

      <div className="stagger-sections relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pt-4">
        <header className="flex items-center gap-3">
          <Link
            href="/groups"
            aria-label={t("groups.backToGroups")}
            className="hover:bg-accent focus-visible:ring-ring/50 -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 active:scale-95"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div
            className={cn(
              "ring-card shadow-e1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br text-xl font-semibold text-white ring-2",
              avatarGradient(group.name),
            )}
          >
            {group.icon || group.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-heading truncate text-2xl leading-tight font-semibold">
              {group.name}
            </h1>
            <button
              type="button"
              onClick={() => selectTab("group")}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-fit items-center gap-2 rounded-md text-xs outline-none focus-visible:ring-3"
            >
              <MemberAvatarStack members={group.members} />
              <span>
                {memberCount === 1
                  ? t("groups.memberCountSingular")
                  : t("groups.membersCount", { count: memberCount })}
                {" · "}
                {group.currency}
              </span>
            </button>
          </div>
        </header>

        {group.archived && (
          <ArchivedBanner group={group} canManage={isGroupManager(group.members[user.uid]?.role)} />
        )}

        <BalanceHero
          groupId={groupId}
          groupName={group.name}
          balances={balances}
          members={group.members}
          currentUid={user.uid}
          currency={group.currency}
          isEmpty={expenses.length === 0 && settlements.length === 0}
          onShowAll={() => selectTab("balances")}
        />

        <TournamentBanner groupId={groupId} currentUid={user.uid} />
        <LuckRoundBanner group={group} currentUid={user.uid} />

        <ChatEntryCard groupId={groupId} members={group.members} currentUid={user.uid} />

        <StartGameButton groupId={groupId} group={group} currentUid={user.uid} className="w-full" />

        <Tabs value={tab} onValueChange={selectTab} className="pt-1">
          <div ref={setTabsSentinel} aria-hidden="true" />
          <div
            data-pinned={tabsPinned}
            className="data-[pinned=true]:bg-background/85 sticky top-0 z-20 -mx-4 px-4 py-2 transition-[background-color,box-shadow] duration-(--duration-fast) data-[pinned=true]:shadow-[0_1px_0_var(--border)] data-[pinned=true]:backdrop-blur-md"
          >
            <TabsList>
              <TabsTrigger value="expenses">{t("groups.tabExpenses")}</TabsTrigger>
              <TabsTrigger value="balances">{t("groups.tabBalances")}</TabsTrigger>
              <TabsTrigger value="games">{t("groups.tabGames")}</TabsTrigger>
              <TabsTrigger value="group">{t("groups.tabGroup")}</TabsTrigger>
            </TabsList>
          </div>

          {/* Mounted even while hidden, so a search you typed or a filter you
              picked is still there when you come back to the tab. `hidden`
              also restarts the entrance animation on every switch. */}
          <TabsContent
            value="expenses"
            forceMount
            className="animate-rise pt-2 data-[state=inactive]:hidden"
          >
            <ActivityFeed
              expenses={expenses}
              settlements={settlements}
              activityLog={activityLog}
              group={group}
              currentUid={user.uid}
            />
          </TabsContent>
          <TabsContent
            value="balances"
            forceMount
            className="animate-rise pt-2 data-[state=inactive]:hidden"
          >
            <BalancesTab
              groupId={groupId}
              groupName={group.name}
              balances={balances}
              expenses={expenses}
              balanceExpenses={balanceExpenses}
              settlements={settlements}
              members={group.members}
              currentUid={user.uid}
              currency={group.currency}
              hasShareLink={!!group.settlementShareToken}
              canManage={isGroupManager(group.members[user.uid]?.role)}
            />
          </TabsContent>
          <TabsContent
            value="games"
            forceMount
            className="animate-rise pt-2 data-[state=inactive]:hidden"
          >
            <GamesTab
              expenses={expenses}
              group={group}
              currentUid={user.uid}
              active={tab === "games"}
            />
          </TabsContent>
          <TabsContent
            value="group"
            forceMount
            className="animate-rise pt-2 data-[state=inactive]:hidden"
          >
            <GroupSettingsTab
              group={group}
              recurringRules={recurringRules}
              hasBookings={expenses.length > 0 || settlements.length > 0}
              currentUid={user.uid}
            />
          </TabsContent>
        </Tabs>

        {/*
          Pinned under the thumb rather than parked in the flow, where the
          first scroll into the ledger used to take it off-screen. Sticky, not
          fixed: it keeps its own space at the end of the page, so the last
          row is never trapped underneath it. On touch devices it steps aside
          while a field on the page has focus — with the Android keyboard up
          it would otherwise cover half of what's left of the screen. On
          wider screens, where the column no longer spans the window, it
          floats as a dock instead of fogging a box-shaped patch of page.
        */}
        <div className="from-background md:bg-card/80 md:shadow-e2 md:ring-foreground/10 sticky bottom-0 z-20 -mx-4 mt-auto bg-linear-to-t from-55% to-transparent px-4 pt-6 pb-[max(env(safe-area-inset-bottom),1rem)] md:bottom-4 md:mx-0 md:mb-4 md:rounded-2xl md:bg-none md:p-3 md:ring-1 md:backdrop-blur-md pointer-coarse:group-has-[input:focus]/page:hidden">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <AddExpenseDialog
              groupId={groupId}
              members={group.members}
              currency={group.currency}
              currentUid={user.uid}
              trigger={
                <Button size="lg" className="shadow-e2 w-full" disabled={!online}>
                  <Plus />
                  {t("expenses.add")}
                </Button>
              }
            />
            <RecordSettlementDialog
              groupId={groupId}
              members={group.members}
              currency={group.currency}
              currentUid={user.uid}
              trigger={
                <Button
                  variant="outline"
                  size="lg"
                  className="shadow-e2"
                  aria-label={t("settlements.record")}
                  disabled={!online}
                >
                  <ArrowLeftRight />
                  {t("settlements.recordShort")}
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
