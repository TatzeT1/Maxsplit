"use client";

import { Check, Copy, MessageCircle, Send } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format/money";
import { estimatePlayPath } from "@/lib/games/round-paths";
import type { EstimateRound, GroupMember } from "@/lib/types";

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * Right after an online estimate round starts, the creator's one job is getting
 * the others to open it. The group chat already carries the invite card (posted
 * by `createEstimateRound`); this adds the fastest path — a prefilled WhatsApp
 * message with the share link `estimatePlayPath` (it survives a signed-out
 * in-app browser by routing through sign-in first) — plus a plain copy. Shown
 * only to the creator; the page stops rendering it once somebody has guessed.
 */
export function EstimateInviteCard({
  groupId,
  round,
  members,
  currentUid,
  gameTitle,
}: {
  groupId: string;
  round: EstimateRound;
  members: Record<string, GroupMember>;
  currentUid: string;
  gameTitle: string;
}) {
  const t = useT();
  // `window` only exists on the client; the server render gets "" and the
  // buttons stay disabled until hydration fills the real origin in.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState(false);

  if (currentUid !== round.createdBy) return null;

  const others = Object.keys(round.entrants).filter(
    (uid) => uid !== currentUid && !round.entrants[uid].isPlaceholder,
  );
  if (others.length === 0) return null;

  const nameOf = (uid: string) =>
    Object.hasOwn(members, uid) ? members[uid].displayName : round.entrants[uid].displayName;
  const url = origin ? `${origin}${estimatePlayPath(groupId, round.id)}` : "";
  const stake = round.stake
    ? `${round.stake.description} (${formatMoney(round.stake.amountMinor, round.stake.currency)})`
    : "";
  const message = t("expenses.estimateWhatsAppText", {
    name: nameOf(currentUid),
    game: gameTitle,
    stake,
    url,
  });
  const whatsAppHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure context) — the WhatsApp
      // button and the chat message still work.
    }
  }

  return (
    <section
      data-slot="estimate-invite-card"
      className="animate-rise flex flex-col gap-3 rounded-2xl border p-4"
    >
      <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
        <Send aria-hidden="true" className="size-3.5" />
        {t("expenses.onlineInviteEyebrow")}
      </span>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="flex shrink-0 -space-x-2">
          {others.slice(0, 3).map((uid) => (
            <GameAvatar key={uid} name={nameOf(uid)} className="ring-card size-10 text-sm ring-2" />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-heading text-base leading-tight font-medium">
            {others.length === 1
              ? t("expenses.onlineInviteTitleOne", { name: nameOf(others[0]) })
              : t("expenses.onlineInviteTitleMany")}
          </h3>
          <p className="text-muted-foreground text-xs">{t("expenses.onlineInviteHint")}</p>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button asChild size="lg" className="w-full" aria-disabled={!url}>
          <a href={url ? whatsAppHref : undefined} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" />
            {t("expenses.onlineInviteWhatsApp")}
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!url}
          aria-label={t("expenses.onlineInviteCopy")}
          onClick={() => void handleCopy()}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span className="sr-only sm:not-sr-only">
            {copied ? t("expenses.tournamentLinkCopied") : t("expenses.onlineInviteCopy")}
          </span>
        </Button>
      </div>
    </section>
  );
}
