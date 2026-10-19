import "server-only";

// Counts and logs every prompt a group sends to the AI models (receipt
// scans, classifications) — the meter lib/receipt/scan.ts takes. Three
// places, all written here only:
// - groups/{groupId}/aiUsage/{month}: the group's count, checked against
//   effectiveAiLimit before each prompt (managers read it, rules);
// - groups/{groupId}/aiCalls/{id}: one entry per prompt, what was asked or
//   read as text, never the photo, deleted by Firestore TTL on `expiresAt`;
// - aiProviderUsage/{day}: HTTP requests per provider and day (server-only),
//   the admin's own count against the free tiers — Gemini has no API that
//   says what is left.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ModelMeter } from "@/lib/receipt/scan";
import type { AiCall, AiCallKind, Group, GroupAiUsage } from "@/lib/types";
import { aiUsageDay, aiUsageMonth, effectiveAiLimit } from "./limits";

/** How long an AI call stays in the log. */
export const LOG_RETENTION_DAYS = 90;

/** Texts kept per call, and characters per text — a classify batch is 60 lines. */
const MAX_SUMMARY_TEXTS = 60;
const MAX_SUMMARY_CHARS = 120;

function usageRef(groupId: string, month: string) {
  return adminDb.collection("groups").doc(groupId).collection("aiUsage").doc(month);
}

/** Prompts the group may still send this month — 0 when blocked or spent. Read only, takes nothing. */
export async function aiAllowanceLeft(
  groupId: string,
  group: Pick<Group, "aiRequestLimit">,
  now: Date = new Date(),
): Promise<number> {
  const month = aiUsageMonth(now);
  const snap = await usageRef(groupId, month).get();
  const used = (snap.data() as GroupAiUsage | undefined)?.count ?? 0;
  return Math.max(0, effectiveAiLimit(group) - used);
}

/**
 * The meter for prompts sent on behalf of `groupId`. `take` counts one prompt
 * against the month, in a transaction with the group's limit — counted
 * before the model is asked, like the per-user quotas: a failed read still
 * spent a request. `record` writes the log entry and the provider counts.
 */
export function groupAiMeter(groupId: string, uid: string | null, kind: AiCallKind): ModelMeter {
  const groupRef = adminDb.collection("groups").doc(groupId);
  return {
    async take() {
      const now = new Date();
      const month = aiUsageMonth(now);
      const ref = usageRef(groupId, month);
      return adminDb.runTransaction(async (tx) => {
        const [groupSnap, usageSnap] = await Promise.all([tx.get(groupRef), tx.get(ref)]);
        if (!groupSnap.exists) return false;
        const used = (usageSnap.data() as GroupAiUsage | undefined)?.count ?? 0;
        if (used >= effectiveAiLimit(groupSnap.data() as Group)) return false;
        const usage: GroupAiUsage = { month, count: used + 1, updatedAt: now.toISOString() };
        tx.set(ref, usage);
        return true;
      });
    },

    async record({ answeredBy, attempts, summary }) {
      const now = new Date();
      const call: Omit<AiCall, "id"> = {
        kind,
        uid,
        createdAt: now.toISOString(),
        ok: answeredBy !== null,
        answeredBy,
        attempts,
        summary: summary
          .slice(0, MAX_SUMMARY_TEXTS)
          .map((text) => text.slice(0, MAX_SUMMARY_CHARS)),
      };
      const batch = adminDb.batch();
      batch.set(groupRef.collection("aiCalls").doc(), {
        ...call,
        expiresAt: Timestamp.fromMillis(now.getTime() + LOG_RETENTION_DAYS * 86_400_000),
      });
      // set() takes the keys literally — a model name with a dot is no field path here.
      const counts: Record<string, FieldValue> = {};
      for (const entry of attempts) {
        if (entry.requests > 0) counts[entry.provider] = FieldValue.increment(entry.requests);
      }
      if (Object.keys(counts).length > 0) {
        const day = aiUsageDay(now);
        batch.set(adminDb.collection("aiProviderUsage").doc(day), { day, counts }, { merge: true });
      }
      await batch.commit();
    },
  };
}
