"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import type { ActionResult } from "./profile";

/**
 * Marks the setup guide as done, whether the user finished it or hit
 * "Überspringen" — both cases stop it from showing again after sign-in. See
 * OnboardingFlow (components/onboarding/onboarding-flow.tsx), which is the
 * only caller, and the Profile page's replay link for revisiting it later.
 */
export async function completeOnboarding(): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  await adminDb
    .doc(`users/${session.uid}`)
    .set({ onboardingCompletedAt: new Date().toISOString() }, { merge: true });

  return { ok: true, data: null };
}
