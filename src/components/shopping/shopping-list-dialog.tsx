"use client";

import { ShoppingCart } from "lucide-react";
import { type FormEvent, useState } from "react";
import { EmojiPicker } from "@/components/groups/emoji-picker";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createShoppingList, updateShoppingList } from "@/lib/actions/shopping";
import { callAction } from "@/lib/call-action";
import { newClientMessageId } from "@/lib/chat/client-id";
import {
  MAX_LISTS_PER_GROUP,
  MAX_LIST_NAME_LENGTH,
  SHOPPING_LIST_ICONS,
} from "@/lib/shopping/shopping";
import { useOnline } from "@/lib/use-online";
import type { ShoppingList } from "@/lib/types";

/**
 * Creates a list (no `list`) or renames one. Controlled: the caller opens it
 * from a button or a menu item. `onCreated` gets the new list's id.
 */
export function ShoppingListDialog({
  groupId,
  list,
  open,
  onOpenChange,
  onCreated,
}: {
  groupId: string;
  list?: Pick<ShoppingList, "id" | "name" | "icon">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (listId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Radix unmounts closed content, so every opening starts from a fresh form. */}
        <ShoppingListForm
          groupId={groupId}
          list={list}
          onDone={(listId) => {
            onOpenChange(false);
            if (!list) onCreated?.(listId);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ShoppingListForm({
  groupId,
  list,
  onDone,
}: {
  groupId: string;
  list?: Pick<ShoppingList, "id" | "name" | "icon">;
  onDone: (listId: string) => void;
}) {
  const [name, setName] = useState(list?.name ?? "");
  const [icon, setIcon] = useState<string | null>(list?.icon ?? null);
  // Chosen once per opening, so a retried "Neue Liste" can't create a second list.
  const [listId] = useState(newClientMessageId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const t = useT();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!online || loading) return;
    setLoading(true);
    setError(null);
    const result = await callAction(() =>
      list
        ? updateShoppingList({ groupId, listId: list.id, name, icon })
        : createShoppingList({ groupId, listId, name, icon }),
    );
    setLoading(false);
    if (!result.ok) {
      setError(
        result.error === "too-many-lists"
          ? t("shopping.errorTooManyLists", { count: MAX_LISTS_PER_GROUP })
          : result.error === "network"
            ? t("errors.notSaved")
            : t("shopping.errorGeneric"),
      );
      return;
    }
    onDone(list?.id ?? listId);
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{list ? t("shopping.editListTitle") : t("shopping.newListTitle")}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-2 py-4">
        <Label htmlFor="shopping-list-name">{t("shopping.listNameLabel")}</Label>
        <div className="flex items-center gap-2">
          <EmojiPicker
            value={icon}
            onChange={setIcon}
            emojis={SHOPPING_LIST_ICONS}
            fallback={<ShoppingCart className="h-4 w-4" />}
            colorClassName="bg-primary/10 text-primary"
            ariaLabel={t("shopping.iconPickerLabel")}
            resetLabel={t("shopping.iconReset")}
          />
          <Input
            id="shopping-list-name"
            maxLength={MAX_LIST_NAME_LENGTH}
            className="flex-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("shopping.listNamePlaceholder")}
            autoFocus
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {!online && <p className="text-muted-foreground text-xs">{t("common.offline")}</p>}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!online || loading || !name.trim()}>
          {list ? t("common.save") : t("shopping.newList")}
        </Button>
      </DialogFooter>
    </form>
  );
}
