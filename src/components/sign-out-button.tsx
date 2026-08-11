"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { auth } from "@/lib/firebase/client";

/** Shared sign-out side effect (clears the session cookie, signs out of client Firebase Auth, redirects home) for any UI that triggers it. */
export function useSignOut(): { signOut: () => Promise<void>; loading: boolean } {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(auth);
    } finally {
      router.push("/");
      router.refresh();
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
