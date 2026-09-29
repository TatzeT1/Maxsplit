"use client";

import { Pencil, Users } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
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
import { Select } from "@/components/ui/select";
import { useT } from "@/components/locale-provider";
import { EmojiPicker } from "@/components/groups/emoji-picker";
import { updateGroup } from "@/lib/actions/groups";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { GROUP_ICONS } from "@/lib/emoji";
import { MAX_NAME_LENGTH } from "@/lib/ledger-input";
import type { Group } from "@/lib/types";

export function EditGroupDialog({
  group,
  currencyLocked,
  trigger,
}: {
  group: Group;
  /**
   * True once the group has anything booked — the server then refuses a
   * currency change (see hasLedgerEntries in lib/actions/groups.ts), so the
   * picker is disabled with a hint instead of failing on save.
   */
  currencyLocked: boolean;
  /** Defaults to a pencil icon button. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [icon, setIcon] = useState<string | null>(group.icon ?? null);
  const [currency, setCurrency] = useState(group.currency);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(group.name);
      setIcon(group.icon ?? null);
      setCurrency(group.currency);
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateGroup({ groupId: group.id, name, currency, icon });
    setLoading(false);
    if (!result.ok) {
      setError(
        result.error === "currency-locked"
          ? t("groups.currencyLockedError")
          : t("groups.editError"),
      );
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label={t("groups.editGroup")}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("groups.editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-group-name">{t("groups.nameLabel")}</Label>
              <div className="flex items-center gap-2">
                <EmojiPicker
                  value={icon}
                  onChange={setIcon}
                  emojis={GROUP_ICONS}
                  fallback={
                    name.trim() ? (
                      name.trim().charAt(0).toUpperCase()
                    ) : (
                      <Users className="h-4 w-4" />
                    )
                  }
                  colorClassName="bg-primary/10 text-primary"
                  ariaLabel={t("groups.iconPickerLabel")}
                  resetLabel={t("groups.iconReset")}
                />
                <Input
                  id="edit-group-name"
                  maxLength={MAX_NAME_LENGTH}
                  className="flex-1"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("groups.namePlaceholder")}
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-group-currency">{t("groups.currencyLabel")}</Label>
              <Select
                id="edit-group-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                disabled={currencyLocked}
                aria-describedby={currencyLocked ? "edit-group-currency-hint" : undefined}
              >
                {/* A legacy group can hold a code the picker no longer offers — keep it selectable. */}
                {[...new Set([...SUPPORTED_CURRENCIES, group.currency])].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              {currencyLocked && (
                <p id="edit-group-currency-hint" className="text-muted-foreground text-xs">
                  {t("groups.currencyLockedHint")}
                </p>
              )}
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
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
