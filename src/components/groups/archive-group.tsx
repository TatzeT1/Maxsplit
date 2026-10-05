"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { useT } from "@/components/locale-provider";
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
import { setGroupArchived } from "@/lib/actions/groups";
import { callAction } from "@/lib/call-action";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useOnline } from "@/lib/use-online";
import type { Group } from "@/lib/types";

/** The group is archived or brought back for everyone in it, so the same action serves both. */
function useArchiveToggle(groupId: string, archived: boolean) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await callAction(() => setGroupArchived({ groupId, archived }));
    if (!result.ok) {
      const keys: Record<string, TranslationKey> = {
        "has-active-recurring": "groups.archiveRecurringError",
        network: "errors.notSaved",
      };
      setError(
        t(
          keys[result.error] ??
            (archived ? "groups.archiveGroupError" : "groups.unarchiveGroupError"),
        ),
      );
    }
    setBusy(false);
  }

  return { busy, error, run };
}

/** "Gruppe archivieren" in the group's settings: a manager's call, and one that reaches every member, so it asks first. */
export function ArchiveGroupRow({ group }: { group: Group }) {
  const t = useT();
  const online = useOnline();
  const { busy, error, run } = useArchiveToggle(group.id, true);

  return (
    <div className="flex flex-col gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            className="h-11 w-full justify-start"
            disabled={busy || !online}
          >
            <Archive />
            {t("groups.archiveGroup")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("groups.archiveGroupConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("groups.archiveGroupConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={run}>{t("groups.archiveGroup")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

/**
 * Shown on every tab of an archived group, so nobody wonders why it's gone
 * from their list — and so the way back is right where they are. Bringing it
 * back is a manager's call, like archiving it.
 */
export function ArchivedBanner({ group, canManage }: { group: Group; canManage: boolean }) {
  const t = useT();
  const online = useOnline();
  const { busy, error, run } = useArchiveToggle(group.id, false);

  return (
    <section className="bg-muted/60 ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1">
      <div className="flex items-start gap-3">
        <Archive aria-hidden="true" className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-sm font-medium">{t("groups.archivedBannerTitle")}</h2>
          <p className="text-muted-foreground text-sm text-pretty">
            {canManage ? t("groups.archivedBannerBody") : t("groups.archivedBannerBodyMember")}
          </p>
        </div>
      </div>
      {canManage && (
        <Button variant="outline" className="w-full" disabled={busy || !online} onClick={run}>
          <ArchiveRestore />
          {t("groups.unarchiveGroup")}
        </Button>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
