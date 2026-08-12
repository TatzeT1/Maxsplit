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
import { adminDeleteGroup, adminSetGroupArchived } from "@/lib/actions/admin";

export function AdminGroupActions({ groupId, archived }: { groupId: string; archived: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleToggleArchived() {
    setBusy(true);
    setError(null);
    const result = await adminSetGroupArchived({ groupId, archived: !archived });
    if (!result.ok) {
      setError("Failed to update group.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await adminDeleteGroup({ groupId });
    if (!result.ok) {
      setError("Failed to delete group.");
      setBusy(false);
      return;
    }
    router.push("/admin");
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Admin actions</h2>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={handleToggleArchived}>
          {archived ? "Unarchive group" : "Archive group"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={busy}>
              Delete group
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete this group?</AlertDialogTitle>
              <AlertDialogDescription>
                All expenses, settlements, and activity history will be permanently deleted for
                every member. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete}>
                Delete group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
