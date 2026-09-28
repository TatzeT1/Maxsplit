"use client";

import { Check, Copy, MessageCircle, Send } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { formatMoney } from "@/lib/format/money";
import type { GroupMember, Tournament } from "@/lib/types";

/** The public entry link — it survives a logged-out WhatsApp in-app browser by routing through sign-in first. */
export function onlineGameUrl(origin: string, groupId: string, tournamentId: string): string {
  return `${origin}/play/${groupId}/${tournamentId}`;
}

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * Right after an online game starts, the challenger's one job is getting the
 * others to open it. The group chat already carries the challenge (posted by
 * `createTournament`); this card adds the fastest path — a prefilled
 * WhatsApp message with the link — plus a plain copy. Shown only to the
 * creator, and only until the first match is decided.
 */
export function OnlineInviteCard({
  groupId,
  tournament,
  members,
  currentUid,
  gameTitle,
}: {
  groupId: string;
  tournament: Tournament;
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

  if (currentUid !== tournament.createdBy) return null;

  const others = Object.entries(tournament.entrants).filter(
    ([uid, entrant]) => uid !== currentUid && !entrant.isPlaceholder,
  );
  if (others.length === 0) return null;

  const nameOf = (uid: string) => members[uid]?.displayName ?? tournament.entrants[uid].displayName;
  const myName = nameOf(currentUid);
  const url = origin ? onlineGameUrl(origin, groupId, tournament.id) : "";
  const stake = tournament.stake
    ? `${tournament.stake.description} (${formatMoney(tournament.stake.amountMinor, tournament.stake.currency)})`
    : null;
  const message = stake
    ? t("expenses.onlineWhatsAppTextStake", { name: myName, game: gameTitle, stake, url })
    : t("expenses.onlineWhatsAppText", { name: myName, game: gameTitle, url });
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
    <section className="animate-rise flex flex-col gap-3 rounded-2xl border p-4">
      <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
        <Send aria-hidden="true" className="size-3.5" />
        {t("expenses.onlineInviteEyebrow")}
      </span>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="flex shrink-0 -space-x-2">
          {others.slice(0, 3).map(([uid]) => (
            <GameAvatar key={uid} name={nameOf(uid)} className="ring-card size-10 text-sm ring-2" />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-heading text-base leading-tight font-medium">
            {others.length === 1
              ? t("expenses.onlineInviteTitleOne", { name: nameOf(others[0][0]) })
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
