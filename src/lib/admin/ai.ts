import "server-only";
import { dailyRequestBudget, aiUsageDay, aiUsageMonth, effectiveAiLimit } from "@/lib/ai/limits";
import { adminDb } from "@/lib/firebase/admin";
import type { AiCall, Group, GroupAiUsage } from "@/lib/types";

/** Calls on the AI page across all groups, and on one group's admin page. */
const RECENT_CALLS = 100;
const RECENT_GROUP_CALLS = 50;

export interface AdminAiCall extends AiCall {
  groupId: string;
}

export interface AdminProviderUsage {
  provider: string;
  today: number;
  month: number;
  /** Free-tier requests per day, if known (dailyRequestBudget). */
  dailyBudget: number | null;
}

export interface AdminGroupAiUsage {
  groupId: string;
  name: string;
  icon: string | null;
  used: number;
  limit: number;
  /** True when the group has no limit of its own and gets the default. */
  isDefault: boolean;
}

export interface AdminAiOverview {
  month: string;
  today: string;
  promptsThisMonth: number;
  providers: AdminProviderUsage[];
  groups: AdminGroupAiUsage[];
  /** Null when the query failed — the aiCalls collection-group index isn't deployed yet. */
  recentCalls: AdminAiCall[] | null;
}

/**
 * The latest prompts of every group. Needs the collection-group index in
 * firestore.indexes.json, which exists only once deployed — until then
 * FAILED_PRECONDITION (9), shown as such rather than crashing the page.
 */
async function latestCalls(): Promise<AdminAiCall[] | null> {
  try {
    const snap = await adminDb
      .collectionGroup("aiCalls")
      .orderBy("createdAt", "desc")
      .limit(RECENT_CALLS)
      .get();
    return snap.docs.map(toCall);
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 9) throw error;
    console.error("[admin-ai] latest prompts need the aiCalls index:", error);
    return null;
  }
}

function toCall(doc: FirebaseFirestore.QueryDocumentSnapshot): AdminAiCall {
  const data = doc.data() as Omit<AiCall, "id">;
  return {
    id: doc.id,
    groupId: doc.ref.parent.parent?.id ?? "",
    kind: data.kind,
    uid: data.uid ?? null,
    createdAt: data.createdAt,
    ok: data.ok,
    answeredBy: data.answeredBy ?? null,
    attempts: data.attempts ?? [],
    summary: data.summary ?? [],
  };
}

/** Every day of `month` up to and including `today`, as "yyyy-mm-dd". */
function daysSoFar(month: string, today: string): string[] {
  const last = Number(today.slice(8, 10));
  return Array.from(
    { length: last },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}

export async function getAiOverview(now: Date = new Date()): Promise<AdminAiOverview> {
  const month = aiUsageMonth(now);
  const today = aiUsageDay(now);

  const [groupsSnap, daySnaps, recentCalls] = await Promise.all([
    adminDb.collection("groups").get(),
    adminDb.getAll(
      ...daysSoFar(month, today).map((day) => adminDb.collection("aiProviderUsage").doc(day)),
    ),
    latestCalls(),
  ]);

  const usageSnaps =
    groupsSnap.size > 0
      ? await adminDb.getAll(
          ...groupsSnap.docs.map((doc) => doc.ref.collection("aiUsage").doc(month)),
        )
      : [];
  const groups = groupsSnap.docs.map((doc, index): AdminGroupAiUsage => {
    const group = doc.data() as Omit<Group, "id">;
    return {
      groupId: doc.id,
      name: group.name,
      icon: group.icon ?? null,
      used: (usageSnaps[index].data() as GroupAiUsage | undefined)?.count ?? 0,
      limit: effectiveAiLimit(group),
      isDefault: typeof group.aiRequestLimit !== "number",
    };
  });
  // The busiest first; blocked and custom limits next, so they don't hide among the idle.
  groups.sort(
    (a, b) =>
      b.used - a.used || Number(a.isDefault) - Number(b.isDefault) || a.name.localeCompare(b.name),
  );

  const byProvider = new Map<string, AdminProviderUsage>();
  for (const snap of daySnaps) {
    const counts = (snap.data()?.counts ?? {}) as Record<string, number>;
    for (const [provider, requests] of Object.entries(counts)) {
      const entry = byProvider.get(provider) ?? {
        provider,
        today: 0,
        month: 0,
        dailyBudget: dailyRequestBudget(provider),
      };
      entry.month += requests;
      if (snap.id === today) entry.today += requests;
      byProvider.set(provider, entry);
    }
  }

  return {
    month,
    today,
    promptsThisMonth: groups.reduce((sum, group) => sum + group.used, 0),
    providers: [...byProvider.values()].sort((a, b) => b.month - a.month),
    groups,
    recentCalls,
  };
}

export interface AdminGroupAi {
  month: string;
  used: number;
  limit: number;
  /** The admin-set limit, or null for the default. */
  ownLimit: number | null;
  recentCalls: AdminAiCall[];
}

export async function getGroupAi(groupId: string, now: Date = new Date()): Promise<AdminGroupAi> {
  const month = aiUsageMonth(now);
  const groupRef = adminDb.collection("groups").doc(groupId);
  const [groupSnap, usageSnap, callsSnap] = await Promise.all([
    groupRef.get(),
    groupRef.collection("aiUsage").doc(month).get(),
    groupRef.collection("aiCalls").orderBy("createdAt", "desc").limit(RECENT_GROUP_CALLS).get(),
  ]);
  const group = (groupSnap.data() ?? {}) as Partial<Group>;
  return {
    month,
    used: (usageSnap.data() as GroupAiUsage | undefined)?.count ?? 0,
    limit: effectiveAiLimit(group),
    ownLimit: typeof group.aiRequestLimit === "number" ? group.aiRequestLimit : null,
    recentCalls: callsSnap.docs.map(toCall),
  };
}
