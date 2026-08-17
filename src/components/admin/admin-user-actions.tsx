"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { adminResetOnboarding, adminSetUserBanned } from "@/lib/actions/admin";

export function AdminUserActions({
  uid,
  banned,
  onboardingCompletedAt,
}: {
  uid: string;
  banned: boolean;
  onboardingCompletedAt: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleResetOnboarding() {
    setBusy(true);
    setError(null);
    const result = await adminResetOnboarding({ uid });
    if (!result.ok) {
      setError("Failed to reset onboarding.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  async function handleUnban() {
    setBusy(true);
    setError(null);
    const result = await adminSetUserBanned({ uid, banned: false });
    if (!result.ok) {
      setError("Failed to unban user.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  async function handleBan() {
    setBusy(true);
    setError(null);
    const result = await adminSetUserBanned({ uid, banned: true });
    if (!result.ok) {
      setError(
        result.error === "cannot-ban-admin"
          ? "Admins can't be banned."
          : result.error === "cannot-ban-self"
            ? "You can't ban yourself."
            : "Failed to ban user.",
      );
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Admin actions</h2>
      <div className="flex gap-2">
        {banned ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={handleUnban}>
            Unban user
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={busy}>
                Ban user
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Ban this user?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their account is disabled and their session ends immediately, so they can no
                  longer sign in or view any group. Their groups, expenses, and balances stay
                  intact. This can be reversed with Unban.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleBan}>
                  Ban user
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {onboardingCompletedAt && (
          <Button variant="outline" size="sm" disabled={busy} onClick={handleResetOnboarding}>
            Reset onboarding
          </Button>
        )}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
