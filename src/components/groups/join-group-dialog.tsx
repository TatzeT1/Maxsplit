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
import { joinGroupByInviteCode } from "@/lib/actions/groups";
import { t } from "@/lib/i18n/de";

export function JoinGroupDialog() {
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    const result = await joinGroupByInviteCode({ inviteCode });
    if (!result.ok) {
      setError(true);
      setLoading(false);
      return;
    }
    setOpen(false);
    setInviteCode("");
    setLoading(false);
    router.push(`/groups/${result.data.groupId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("groups.join")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
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
      </DialogContent>
    </Dialog>
  );
}
