"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { joinGroupByInviteCode, previewGroupByInviteCode } from "@/lib/actions/groups";
import { cn } from "@/lib/utils";

interface Preview {
  groupId: string;
  groupName: string;
  placeholders: { id: string; displayName: string }[];
}

export function JoinGroupDialog() {
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  const t = useT();

  function reset() {
    setInviteCode("");
    setPreview(null);
    setClaimId(null);
    setError(false);
  }

  async function finishJoin(groupId: string, claimPlaceholderId?: string) {
    const result = await joinGroupByInviteCode({ inviteCode, claimPlaceholderId });
    setLoading(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    setOpen(false);
    reset();
    router.push(`/groups/${groupId}`);
  }

  async function handleCodeSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);

    const result = await previewGroupByInviteCode({ inviteCode });
    if (!result.ok) {
      setLoading(false);
      setError(true);
      return;
    }

    if (result.data.placeholders.length === 0) {
      await finishJoin(result.data.groupId);
      return;
    }

    setLoading(false);
    setPreview(result.data);
  }

  async function handleSelectSubmit(event: FormEvent) {
    event.preventDefault();
    if (!preview) return;
    setLoading(true);
    setError(false);
    await finishJoin(preview.groupId, claimId ?? undefined);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{t("groups.join")}</Button>
      </DialogTrigger>
      <DialogContent>
        {!preview ? (
          <form onSubmit={handleCodeSubmit}>
            <DialogHeader>
              <DialogTitle>{t("groups.joinTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-code">{t("groups.inviteCodeLabel")}</Label>
                <Input
                  id="invite-code"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder={t("groups.inviteCodePlaceholder")}
                  autoFocus
                  required
                />
                <p className="text-muted-foreground text-sm">{t("groups.inviteCodeHint")}</p>
              </div>
              {error && <p className="text-destructive text-sm">{t("groups.joinError")}</p>}
            </div>
            <DialogFooter>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={loading || !inviteCode.trim()}
              >
                {loading ? t("common.loading") : t("common.confirm")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={handleSelectSubmit}>
            <DialogHeader>
              <DialogTitle>{t("groups.joinStep2Title")}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <p className="text-muted-foreground text-sm">{t("groups.joinStep2Hint")}</p>
              <div className="flex flex-col gap-1.5">
                {preview.placeholders.map((placeholder) => (
                  <button
                    key={placeholder.id}
                    type="button"
                    onClick={() => setClaimId(placeholder.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                      claimId === placeholder.id
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "hover:bg-accent",
                    )}
                  >
                    {placeholder.displayName}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setClaimId(null)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                    claimId === null
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "hover:bg-accent",
                  )}
                >
                  {t("groups.joinAsNew")}
                </button>
              </div>
              {error && <p className="text-destructive text-sm">{t("groups.joinError")}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? t("common.loading") : t("groups.joinContinue")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
