"use client";

import { Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/groups";
import { callAction } from "@/lib/call-action";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useOnline } from "@/lib/use-online";

/** How long a deletion stays undoable. Long enough to read it and reach for the button. */
export const UNDO_VISIBLE_MS = 8000;

/** Never stack more than this many — a burst of deletions keeps the newest few. */
const MAX_TOASTS = 3;

/** One deletion that can still be taken back. */
export interface UndoOffer {
  id: string;
  /** What was deleted, already worded: "„Pizza“ gelöscht". */
  message: string;
  /** Runs the matching restore Server Action. */
  undo: () => Promise<ActionResult<unknown>>;
}

const ERROR_KEYS: Record<string, TranslationKey> = {
  "not-owner": "undo.notOwner",
  "member-gone": "undo.memberGone",
  "invalid-currency": "undo.currencyChanged",
  network: "errors.notSaved",
};

/**
 * The toasts for deletions that can still be undone, and the state behind
 * them. Lives with whatever lists the rows rather than in each row: a deleted
 * row is gone from the list the moment the server confirms, taking any state
 * it held — including a toast — along with it.
 */
export function useUndoOffers() {
  const [offers, setOffers] = useState<UndoOffer[]>([]);
  const nextId = useRef(0);

  const offer = useCallback((next: Omit<UndoOffer, "id">) => {
    const id = `undo-${nextId.current++}`;
    setOffers((current) => [...current, { ...next, id }].slice(-MAX_TOASTS));
  }, []);

  const dismiss = useCallback((id: string) => {
    setOffers((current) => current.filter((candidate) => candidate.id !== id));
  }, []);

  return { offers, offer, dismiss };
}

function UndoToast({ offer, onDismiss }: { offer: UndoOffer; onDismiss: (id: string) => void }) {
  const t = useT();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hovering or focusing the toast holds the clock: someone aiming at the
  // button, or reading it with a screen reader, must not lose it mid-reach.
  const [held, setHeld] = useState(false);

  // Restarted by a failure too, so its message gets the same time to be read.
  useEffect(() => {
    if (busy || held) return;
    const timer = setTimeout(() => onDismiss(offer.id), UNDO_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [busy, held, error, offer.id, onDismiss]);

  async function handleUndo() {
    setBusy(true);
    setError(null);
    const result = await callAction(offer.undo);
    if (result.ok) {
      // The row coming back is the confirmation.
      onDismiss(offer.id);
      return;
    }
    setError(t(ERROR_KEYS[result.error] ?? "undo.notRestored"));
    setBusy(false);
  }

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="bg-foreground text-background shadow-e2 animate-rise pointer-events-auto flex items-center gap-1 rounded-xl py-1.5 pr-1.5 pl-4 text-sm"
    >
      <span className="min-w-0 flex-1 py-1.5 leading-snug">{error ?? offer.message}</span>
      <Button
        type="button"
        variant="ghost"
        className="text-background hover:bg-background/15 hover:text-background h-10 px-3 font-semibold"
        disabled={busy || !online}
        onClick={handleUndo}
      >
        <Undo2 />
        {t("undo.action")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-background/70 hover:bg-background/15 hover:text-background size-10"
        aria-label={t("undo.dismiss")}
        onClick={() => onDismiss(offer.id)}
      >
        <X />
      </Button>
    </div>
  );
}

/**
 * Sits above the group page's pinned action bar (the bottom offset is that
 * bar's height: its top padding, a large button and the safe-area padding),
 * and lets taps through everywhere but on a toast. The live region is always
 * rendered, even with nothing in it — one that appears together with its
 * first message is often not announced.
 */
export function UndoToasts({
  offers,
  onDismiss,
}: {
  offers: UndoOffer[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),1rem)+5.5rem)] z-30 mx-auto flex w-full max-w-lg flex-col gap-2 px-4"
    >
      {offers.map((offer) => (
        <UndoToast key={offer.id} offer={offer} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
