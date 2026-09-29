"use server";

import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { isGroupManager } from "@/lib/groups/permissions";
import type { Group } from "@/lib/types";
import type { ActionResult } from "./groups";

function newShareToken(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Returns the group's public settlement-PDF share token, generating one on
 * first request. The token itself (not group membership) is what gates the
 * public /share/settlement/[groupId]/[token] route — anyone with the link
 * can view the PDF without an account, by design (see AGENTS.md: Split
 * avoids Firebase Storage, so the PDF is generated on demand from Firestore
 * data rather than stored as a file).
 */
export async function getOrCreateSettlementShareToken(input: {
  groupId: string;
}): Promise<ActionResult<{ token: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(session.uid)) return { ok: false, error: "forbidden" };

  if (group.settlementShareToken) {
    return { ok: true, data: { token: group.settlementShareToken } };
  }

  const token = newShareToken();
  await groupRef.update({ settlementShareToken: token });
  return { ok: true, data: { token } };
}

/**
 * Replaces the group's share token, so every link handed out so far stops
 * working (the route 404s on a token mismatch) — the only way to take back a
 * link that went further than intended, since the token never expires.
 * Managers only: it breaks the link for everyone the group already sent it
 * to. Returns the new token, so the caller can offer the fresh link.
 */
export async function rotateSettlementShareToken(input: {
  groupId: string;
}): Promise<ActionResult<{ token: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(session.uid)) return { ok: false, error: "forbidden" };
  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  const token = newShareToken();
  await groupRef.update({ settlementShareToken: token });
  return { ok: true, data: { token } };
}
