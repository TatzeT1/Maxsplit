"use client";

import { signOut } from "firebase/auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { auth } from "@/lib/firebase/client";
import { clearLocalData } from "@/lib/offline/clear-local-data";
import { unsubscribeThisDevice } from "@/lib/push/client";

/** Shared sign-out side effect (turns off this device's pushes, clears the session cookie, signs out of client Firebase Auth, wipes the offline copy, reloads home) for any UI that triggers it. */
export function useSignOut(): { signOut: () => Promise<void>; loading: boolean } {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      // First, while the session still exists: stop this phone getting the
      // account's pushes — the next person to use it shouldn't see them.
      await unsubscribeThisDevice().catch(() => {});
      // Offline this fails and the cookie outlives the sign-out; SessionGuard
      // clears it on the next visit, when client auth turns out signed out.
      // The local part matters more: it's what stops the next person on this
      // phone from reading the ledger.
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
      await signOut(auth);
      await clearLocalData();
    } finally {
      // A full load, not router.push: clearLocalData terminated Firestore,
      // and no listener can start on a terminated instance.
      window.location.replace("/");
    }
  }

  return { signOut: handleSignOut, loading };
}

export function SignOutButton() {
  const { signOut, loading } = useSignOut();
  const t = useT();

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={loading}>
      {t("nav.signOut")}
    </Button>
  );
}
