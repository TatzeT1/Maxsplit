"use client";

import { UserPlus } from "lucide-react";
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
import { addPlaceholderMember } from "@/lib/actions/groups";
import { t } from "@/lib/i18n/de";

export function AddPlaceholderDialog({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    const result = await addPlaceholderMember({ groupId, displayName: name });
    setLoading(false);

    if (!result.ok) {
      setError(true);
      return;
    }

    setOpen(false);
    setName("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserPlus className="h-3.5 w-3.5" />
          {t("groups.addPlaceholder")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("groups.addPlaceholderTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <p className="text-muted-foreground text-sm">{t("groups.addPlaceholderHint")}</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="placeholder-name">{t("groups.placeholderNameLabel")}</Label>
              <Input
                id="placeholder-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("groups.placeholderNamePlaceholder")}
                autoFocus
                required
              />
            </div>
            {error && <p className="text-destructive text-sm">{t("groups.addPlaceholderError")}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" size="lg" className="w-full" disabled={loading || !name.trim()}>
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
