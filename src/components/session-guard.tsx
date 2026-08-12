"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useT } from "@/components/locale-provider";
import { useSignOut } from "@/components/sign-out-button";
import { useAuthState } from "@/lib/firebase/use-current-user";

/**
 * Guards the app shell against the desynced-auth state described in
 * AGENTS.md: the server session cookie is valid (so `(app)/layout.tsx` let
 * the request through) but client Firebase Auth never restored — e.g. its
 * persisted session was evicted or its refresh token expired. Every page
 * under here gates its `onSnapshot` listeners on `useCurrentUser()`, so
 * without this guard that desync rendered as a permanent loading skeleton
 * with no error, indistinguishable from "still loading" (the exact failure
 * mode `reportSnapshotError` was written to avoid for listener errors).
 *
 * Recovery is the same fix that already worked manually: sign out (clears
 * both the stale cookie and the dead client session) and send the user back
 * to "/" to sign in fresh.
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuthState();
  const { signOut } = useSignOut();
  const t = useT();
  const recoveringRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated" && !recoveringRef.current) {
      recoveringRef.current = true;
      void signOut();
    }
  }, [status, signOut]);

  if (status === "unauthenticated") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        <p className="text-muted-foreground text-sm">{t("errors.sessionExpired")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
