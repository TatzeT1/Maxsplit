"use client";

import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, Check, CloudOff, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import { ShoppingItemDialog } from "@/components/shopping/shopping-item-dialog";
import { ShoppingListDialog } from "@/components/shopping/shopping-list-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addShoppingItem,
  clearCheckedShoppingItems,
  deleteShoppingItem,
  deleteShoppingList,
} from "@/lib/actions/shopping";
import type { ActionResult } from "@/lib/actions/groups";
import { callAction } from "@/lib/call-action";
import { newClientMessageId } from "@/lib/chat/client-id";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useScreenSync } from "@/lib/offline/sync-marks";
import { useLiveSources } from "@/lib/offline/use-live-sources";
import { productFamilyEmoji, productFamilyLabelKey } from "@/lib/products/products";
import {
  effectiveChecked,
  prunePendingChecksFor,
  queueCheck,
  unsentCount,
  usePendingChecks,
} from "@/lib/shopping/pending-checks";
import {
  MAX_ITEMS_PER_LIST,
  MAX_ITEM_NAME_LENGTH,
  MAX_QUANTITY_LENGTH,
  filterSuggestions,
  groupByAisle,
  shoppingSuggestions,
  sortChecked,
  type ShoppingSuggestion,
} from "@/lib/shopping/shopping";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type {
  Expense,
  Group,
  GroupMember,
  ProductClass,
  ShoppingCatalog,
  ShoppingItem,
  ShoppingList,
} from "@/lib/types";

const LIVE_SOURCES = ["group", "list", "items"] as const;

/** Recent expenses whose receipts feed the suggestions — enough for a few weeks of shopping. */
const SUGGESTION_EXPENSES = 80;

/** Suggestions shown while the add field is empty. */
const SUGGESTIONS_SHOWN = 12;

/** An add on its way to the server — shown at once, dropped when the listener has it. */
interface PendingAdd {
  id: string;
  name: string;
  quantity: string | null;
  forUid: string | null;
  product: ProductClass | null;
  status: "sending" | "failed";
  error?: string;
}

/** `/groups/[groupId]/shopping/[listId]`: one list — add, tick off (offline too), tidy up. */
export function ShoppingListClient({ groupId, listId }: { groupId: string; listId: string }) {
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [list, setList] = useState<ShoppingList | null | undefined>(undefined);
  const [listFromServer, setListFromServer] = useState(false);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [catalog, setCatalog] = useState<ShoppingCatalog | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [forUid, setForUid] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const router = useRouter();
  const online = useOnline();
  const t = useT();
  const uid = user?.uid ?? null;
  const pendingChecks = usePendingChecks(uid);
  const { live, received, report } = useLiveSources(LIVE_SOURCES);
  const syncedAt = useScreenSync(uid ? `${uid}:shopping:${groupId}:${listId}` : null, live);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      { includeMetadataChanges: true },
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
        report("group", snapshot);
      },
      (error) => setErrorCode(reportSnapshotError("group", error)),
    );
  }, [groupId, uid, report]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "groups", groupId, "shoppingLists", listId),
      { includeMetadataChanges: true },
      (snapshot) => {
        setList(
          snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as ShoppingList) : null,
        );
        setListFromServer(!snapshot.metadata.fromCache);
        report("list", snapshot);
      },
      (error) => setErrorCode(reportSnapshotError("shopping-list", error)),
    );
  }, [groupId, listId, uid, report]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(db, "groups", groupId, "shoppingLists", listId, "items"),
        orderBy("createdAt", "asc"),
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ShoppingItem);
        setItems(docs);
        const ids = new Set(docs.map((item) => item.id));
        setPendingAdds((current) => {
          const kept = current.filter((add) => !ids.has(add.id));
          return kept.length === current.length ? current : kept;
        });
        prunePendingChecksFor(uid, groupId, listId, docs, !snapshot.metadata.fromCache);
        report("items", snapshot);
      },
      (error) => setErrorCode(reportSnapshotError("shopping-items", error)),
    );
  }, [groupId, listId, uid, report]);

  // The suggestions: a nicety next to the list, so their failure is shown
  // where they would be — never in place of the list.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "groups", groupId, "shoppingState", "catalog"),
      (snapshot) => setCatalog(snapshot.exists() ? (snapshot.data() as ShoppingCatalog) : null),
      (error) => setSuggestionError(reportSnapshotError("shopping-catalog", error)),
    );
  }, [groupId, uid]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(db, "groups", groupId, "expenses"),
        orderBy("date", "desc"),
        limit(SUGGESTION_EXPENSES),
      ),
      (snapshot) => setExpenses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense)),
      (error) => setSuggestionError(reportSnapshotError("shopping-suggestions", error)),
    );
  }, [groupId, uid]);

  const shownItems = useMemo(
    () =>
      (items ?? []).map((item) => ({
        ...item,
        checked: effectiveChecked(item, groupId, listId, pendingChecks),
      })),
    [items, groupId, listId, pendingChecks],
  );
  const openItems = shownItems.filter((item) => !item.checked);
  const checkedItems = sortChecked(shownItems.filter((item) => item.checked));
  const sections = groupByAisle(openItems);
  const suggestions = shoppingSuggestions(catalog, expenses, [...openItems, ...pendingAdds]);
  const matching = filterSuggestions(suggestions, name);
  const unsent = unsentCount(pendingChecks, groupId, listId);

  async function sendAdd(add: PendingAdd) {
    setPendingAdds((current) => [
      ...current.filter((other) => other.id !== add.id),
      { ...add, status: "sending", error: undefined },
    ]);
    const result = await callAction(() =>
      addShoppingItem({
        groupId,
        listId,
        itemId: add.id,
        name: add.name,
        quantity: add.quantity,
        forUid: add.forUid,
        product: add.product,
      }),
    );
    if (result.ok) return;
    const error =
      result.error === "too-many-items"
        ? t("shopping.errorTooManyItems", { count: MAX_ITEMS_PER_LIST })
        : result.error === "network"
          ? t("errors.notSaved")
          : t("shopping.errorGeneric");
    setPendingAdds((current) =>
      current.map((other) => (other.id === add.id ? { ...other, status: "failed", error } : other)),
    );
  }

  function add(itemName: string, product: ProductClass | null) {
    const trimmed = itemName.trim();
    if (!trimmed || !online) return;
    void sendAdd({
      id: newClientMessageId(),
      name: trimmed,
      quantity: quantity.trim() || null,
      forUid: forUid || null,
      product,
      status: "sending",
    });
    setName("");
    setQuantity("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Typed exactly like a known name: take its aisle along.
    const known = suggestions.find(
      (suggestion) =>
        suggestion.name.toLocaleLowerCase("de-DE") === name.trim().toLocaleLowerCase("de-DE"),
    );
    add(name, known?.product ?? null);
  }

  function toggle(item: ShoppingItem) {
    if (!uid) return;
    queueCheck(uid, {
      groupId,
      listId,
      itemId: item.id,
      checked: !item.checked,
      changedAt: new Date().toISOString(),
    });
  }

  async function runAction<T>(action: () => Promise<ActionResult<T>>) {
    setActionError(null);
    const result = await callAction(action);
    if (!result.ok) {
      setActionError(
        result.error === "network" ? t("errors.notSaved") : t("shopping.errorGeneric"),
      );
    }
    return result.ok;
  }

  async function handleDeleteList() {
    if (await runAction(() => deleteShoppingList({ groupId, listId }))) {
      router.push(`/groups/${groupId}/shopping`);
    }
  }

  if (user && errorCode) {
    return (
      <div className="mx-auto w-full max-w-lg p-4">
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
        </div>
      </div>
    );
  }

  if (
    user &&
    !online &&
    !live &&
    (syncedAt === null || (received("list") && !list) || (received("group") && !group))
  ) {
    return <NeedsConnection body={t("shopping.notSynced")} />;
  }

  if (user && list === null && listFromServer) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-3 p-4">
        <p className="text-muted-foreground text-sm">{t("shopping.listMissing")}</p>
        <Link href={`/groups/${groupId}/shopping`} className="text-primary text-sm font-medium">
          {t("shopping.backToLists")}
        </Link>
      </div>
    );
  }

  if (!user || !group || !list || items === null) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 p-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const members = group.members;
  const nothingOpen = openItems.length === 0 && pendingAdds.length === 0;

  return (
    <div className="relative flex flex-1 flex-col">
      <AmbientBackdrop />
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pt-4 pb-10">
        <header className="flex items-center gap-3">
          <Link
            href={`/groups/${groupId}/shopping`}
            aria-label={t("shopping.backToLists")}
            className="hover:bg-accent focus-visible:ring-ring/50 -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 active:scale-95"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <span className="bg-primary/10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl">
            {list.icon ?? "🛒"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="font-heading truncate text-2xl leading-tight font-medium">
              {list.name}
            </h1>
            <span className="text-muted-foreground truncate text-xs">
              {group.name} ·{" "}
              {openItems.length > 0
                ? t("shopping.openCount", { count: openItems.length })
                : t("shopping.openCountNone")}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("common.moreActions")}>
                <MoreHorizontal className="h-4.5 w-4.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!online} onSelect={() => setRenaming(true)}>
                <Pencil className="h-3.5 w-3.5" />
                {t("shopping.renameList")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!online}
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("shopping.deleteList")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* The add field sits at the top, not parked at the bottom: an
            ordinary scrolling page, so the iOS keyboard can't cover it
            (AGENTS.md, Mobile iOS rule 2). */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              aria-label={t("shopping.addPlaceholder")}
              placeholder={t("shopping.addPlaceholder")}
              maxLength={MAX_ITEM_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!online}
              enterKeyHint="done"
              autoComplete="off"
              className="flex-1"
            />
            <Button type="submit" disabled={!online || !name.trim()} aria-label={t("shopping.add")}>
              <Plus className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">{t("shopping.add")}</span>
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              aria-label={t("shopping.quantityLabel")}
              placeholder={t("shopping.quantityPlaceholder")}
              maxLength={MAX_QUANTITY_LENGTH}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={!online}
              autoComplete="off"
              className="w-32"
            />
            <Select
              aria-label={t("shopping.forLabel")}
              value={forUid}
              onChange={(event) => setForUid(event.target.value)}
              disabled={!online}
            >
              <option value="">
                {t("shopping.forLabel")}: {t("shopping.forEveryone")}
              </option>
              {Object.entries(members).map(([memberUid, member]) => (
                <option key={memberUid} value={memberUid}>
                  {t("shopping.forName", { name: member.displayName })}
                </option>
              ))}
            </Select>
          </div>
          {matching.length > 0 && online && (
            <SuggestionChips suggestions={matching} onPick={(s) => add(s.name, s.product)} />
          )}
          {!online && <p className="text-muted-foreground text-xs">{t("shopping.offlineHint")}</p>}
          {actionError && (
            <p role="alert" className="text-destructive text-sm">
              {actionError}
            </p>
          )}
        </form>

        {unsent > 0 && (
          <div
            role="status"
            className="bg-muted text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          >
            <CloudOff aria-hidden="true" className="size-3.5 shrink-0" />
            {online
              ? t("shopping.unsentOnline")
              : unsent === 1
                ? t("shopping.unsentOfflineSingular")
                : t("shopping.unsentOffline", { count: unsent })}
          </div>
        )}

        {nothingOpen && (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            {checkedItems.length > 0 ? t("shopping.allDone") : t("shopping.emptyList")}
          </p>
        )}

        {pendingAdds.length > 0 && (
          <ul className="bg-card ring-foreground/10 flex flex-col rounded-xl ring-1">
            {pendingAdds.map((add) => (
              <li
                key={add.id}
                className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
              >
                <span className="border-muted-foreground/40 size-6 shrink-0 rounded-full border-2 border-dashed" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{add.name}</span>
                  <span
                    className={cn(
                      "text-xs",
                      add.status === "failed" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {add.status === "failed" ? add.error : t("shopping.sending")}
                  </span>
                </span>
                {add.status === "failed" && (
                  <>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!online}
                      onClick={() => void sendAdd(add)}
                    >
                      {t("shopping.retry")}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        setPendingAdds((current) => current.filter((other) => other.id !== add.id))
                      }
                    >
                      {t("shopping.discard")}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {sections.map((section) => (
          <section key={section.family ?? "unclassified"} className="flex flex-col gap-1.5">
            <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
              {section.family
                ? `${productFamilyEmoji(section.family)} ${t(productFamilyLabelKey(section.family))}`
                : `❔ ${t("shopping.unclassified")}`}
            </h2>
            <ul className="bg-card ring-foreground/10 flex flex-col rounded-xl ring-1">
              {section.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  members={members}
                  online={online}
                  onToggle={() => toggle(item)}
                  onEdit={() => setEditing(item)}
                  onDelete={() =>
                    void runAction(() => deleteShoppingItem({ groupId, listId, itemId: item.id }))
                  }
                />
              ))}
            </ul>
          </section>
        ))}

        {name.trim() === "" && online && suggestions.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
              {t("shopping.suggestionsTitle")}
            </h2>
            <SuggestionChips
              suggestions={suggestions.slice(0, SUGGESTIONS_SHOWN)}
              onPick={(s) => add(s.name, s.product)}
            />
          </section>
        )}
        {suggestionError && (
          <p className="text-destructive text-xs">
            {t("shopping.suggestionsError", { code: suggestionError })}
          </p>
        )}

        {checkedItems.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {t("shopping.inCart", { count: checkedItems.length })}
              </h2>
              <Button
                size="xs"
                variant="ghost"
                disabled={!online}
                onClick={() => setConfirmClear(true)}
              >
                {t("shopping.clearChecked")}
              </Button>
            </div>
            <ul className="bg-card/60 ring-foreground/10 flex flex-col rounded-xl ring-1">
              {checkedItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  members={members}
                  online={online}
                  onToggle={() => toggle(item)}
                  onEdit={() => setEditing(item)}
                  onDelete={() =>
                    void runAction(() => deleteShoppingItem({ groupId, listId, itemId: item.id }))
                  }
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      <ShoppingItemDialog
        groupId={groupId}
        listId={listId}
        item={editing}
        members={members}
        onClose={() => setEditing(null)}
      />
      <ShoppingListDialog
        groupId={groupId}
        list={list}
        open={renaming}
        onOpenChange={setRenaming}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("shopping.deleteListConfirm", { name: list.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("shopping.deleteListConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={!online} onClick={() => void handleDeleteList()}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("shopping.clearCheckedConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("shopping.clearCheckedConfirmBody", { count: checkedItems.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!online}
              onClick={() => void runAction(() => clearCheckedShoppingItems({ groupId, listId }))}
            >
              {t("shopping.clearChecked")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SuggestionChips({
  suggestions,
  onPick,
}: {
  suggestions: readonly ShoppingSuggestion[];
  onPick: (suggestion: ShoppingSuggestion) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.name}
          type="button"
          onClick={() => onPick(suggestion)}
          className="bg-card ring-foreground/10 hover:ring-foreground/25 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ring-1 transition-all active:scale-95"
        >
          <Plus aria-hidden="true" className="text-muted-foreground size-3.5" />
          {suggestion.product && (
            <span aria-hidden="true">{productFamilyEmoji(suggestion.product.family)}</span>
          )}
          {suggestion.name}
        </button>
      ))}
    </div>
  );
}

function ItemRow({
  item,
  members,
  online,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ShoppingItem;
  members: Record<string, GroupMember>;
  online: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const forName = item.forUid ? (members[item.forUid]?.displayName ?? "?") : null;
  const checkedByName =
    item.checked && item.checkedBy ? (members[item.checkedBy]?.displayName ?? null) : null;

  return (
    <li className="flex items-center gap-1 border-b pr-2 last:border-b-0">
      {/* The whole row ticks — a big target for a thumb with a basket in the other hand.
          Works offline: the tick waits on this device (ADR-009). */}
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={
          item.checked
            ? t("shopping.uncheckItem", { name: item.name })
            : t("shopping.checkItem", { name: item.name })
        }
        onClick={onToggle}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left"
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            item.checked
              ? "bg-success border-success text-success-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {item.checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn("truncate text-sm", item.checked && "text-muted-foreground line-through")}
          >
            {item.name}
            {item.quantity && <span className="text-muted-foreground"> · {item.quantity}</span>}
          </span>
          {(forName || checkedByName) && (
            <span className="text-muted-foreground truncate text-xs">
              {[
                forName && t("shopping.forName", { name: forName }),
                checkedByName && t("shopping.checkedBy", { name: checkedByName }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("shopping.itemActions", { name: item.name })}
            className="text-muted-foreground shrink-0"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!online} onSelect={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("common.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={!online} onSelect={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
