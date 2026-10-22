"use client";

import { type FormEvent, useState } from "react";
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
import { Select } from "@/components/ui/select";
import { updateShoppingItem } from "@/lib/actions/shopping";
import { callAction } from "@/lib/call-action";
import { MAX_ITEM_NAME_LENGTH, MAX_QUANTITY_LENGTH } from "@/lib/shopping/shopping";
import { useOnline } from "@/lib/use-online";
import type { GroupMember, ShoppingItem } from "@/lib/types";

/** Edits an item's name, quantity and whom it's for. `item` null = closed. */
export function ShoppingItemDialog({
  groupId,
  listId,
  item,
  members,
  onClose,
}: {
  groupId: string;
  listId: string;
  item: ShoppingItem | null;
  members: Record<string, GroupMember>;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {item && (
          <ItemForm
            groupId={groupId}
            listId={listId}
            item={item}
            members={members}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  groupId,
  listId,
  item,
  members,
  onDone,
}: {
  groupId: string;
  listId: string;
  item: ShoppingItem;
  members: Record<string, GroupMember>;
  onDone: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [forUid, setForUid] = useState(item.forUid ?? "");
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
      updateShoppingItem({
        groupId,
        listId,
        itemId: item.id,
        name,
        quantity: quantity.trim() || null,
        forUid: forUid || null,
      }),
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.error === "network" ? t("errors.notSaved") : t("shopping.errorGeneric"));
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{t("shopping.editItemTitle")}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="shopping-item-name">{t("shopping.itemNameLabel")}</Label>
          <Input
            id="shopping-item-name"
            maxLength={MAX_ITEM_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="flex gap-3">
          <div className="flex w-32 flex-col gap-2">
            <Label htmlFor="shopping-item-quantity">{t("shopping.quantityLabel")}</Label>
            <Input
              id="shopping-item-quantity"
              maxLength={MAX_QUANTITY_LENGTH}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={t("shopping.quantityPlaceholder")}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="shopping-item-for">{t("shopping.forLabel")}</Label>
            <Select
              id="shopping-item-for"
              value={forUid}
              onChange={(event) => setForUid(event.target.value)}
            >
              <option value="">{t("shopping.forEveryone")}</option>
              {Object.entries(members).map(([uid, member]) => (
                <option key={uid} value={uid}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>
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
          {t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
