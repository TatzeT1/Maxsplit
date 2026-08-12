"use client";

import { UserPlus, Users, X } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { useT } from "@/components/locale-provider";
import { EmojiPicker } from "@/components/groups/emoji-picker";
import { createGroup } from "@/lib/actions/groups";
import { GROUP_ICONS } from "@/lib/emoji";

const CURRENCIES = ["EUR", "USD", "CHF", "GBP"];

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [memberNames, setMemberNames] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  const t = useT();

  function updateMemberName(index: number, value: string) {
    setMemberNames((current) => current.map((n, i) => (i === index ? value : n)));
  }

  function addMemberRow() {
    setMemberNames((current) => [...current, ""]);
  }

  function removeMemberRow(index: number) {
    setMemberNames((current) => current.filter((_, i) => i !== index));
  }

  function resetForm() {
    setName("");
    setIcon(null);
    setCurrency("EUR");
    setMemberNames([""]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    const result = await createGroup({
      name,
      currency,
      icon,
      memberNames: memberNames.map((n) => n.trim()).filter((n) => n.length > 0),
    });
    if (!result.ok) {
      setError(true);
      setLoading(false);
      return;
    }
    setOpen(false);
    resetForm();
    setLoading(false);
    router.push(`/groups/${result.data.groupId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t("groups.create")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("groups.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="group-name">{t("groups.nameLabel")}</Label>
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
                  id="group-name"
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
              <Label htmlFor="group-currency">{t("groups.currencyLabel")}</Label>
              <Select
                id="group-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("groups.membersLabel")}</Label>
              <p className="text-muted-foreground text-sm">{t("groups.membersHint")}</p>
              <div className="flex flex-col gap-2">
                {memberNames.map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={value}
                      onChange={(event) => updateMemberName(index, event.target.value)}
                      placeholder={t("groups.placeholderNamePlaceholder")}
                    />
                    {memberNames.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("groups.removeMember")}
                        onClick={() => removeMemberRow(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={addMemberRow}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {t("groups.addAnotherMember")}
              </Button>
            </div>
            {error && <p className="text-destructive text-sm">{t("groups.createError")}</p>}
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
