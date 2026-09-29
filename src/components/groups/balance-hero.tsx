"use client";

import { Check, ChevronRight, Copy, MessageCircle } from "lucide-react";
import { type CSSProperties, useState, useSyncExternalStore } from "react";
import { GiroCodeDialog } from "@/components/groups/girocode-dialog";
import { RecordSettlementDialog } from "@/components/groups/record-settlement-dialog";
import { InkStamp } from "@/components/groups/split-game/celebration";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { useT } from "@/components/locale-provider";
import { AnimatedMoney } from "@/components/ui/animated-money";
import { Button } from "@/components/ui/button";
import { formatMoney, minorToMajor } from "@/lib/format/money";
import { simplifyDebts } from "@/lib/money/balances";
import { buildPaypalMeLink } from "@/lib/payment/paypal-me";
import { buildReminderMessage, whatsAppShareUrl } from "@/lib/payment/reminder";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

/**
 * Past three lines the slip stops being a glance. The rest is one tap away
 * on the balances tab, which lists everyone anyway.
 */
const MAX_LINES = 3;

function CopyButton({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-10", copied && "border-success/40 text-success")}
      onClick={() => copy(value)}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

/** The name a GiroCode addresses: the account holder if they set one, which is what the bank checks. */
function giroCodeName(member: GroupMember): string {
  return member.accountHolderName || member.displayName;
}

/** GiroCodes are euro-only and need the recipient's IBAN and a name to address. */
function canUseGiroCode(
  member: GroupMember | undefined,
  currency: string,
): member is GroupMember & { iban: string } {
  return currency === "EUR" && !!member?.iban && giroCodeName(member).trim().length > 0;
}

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * Everything you can do about one "you owe" line, in the order you'd do it:
 * pay (PayPal.Me link, or copy the details to pay by hand, or scan their
 * GiroCode), then record it.
 */
function PayActions({
  member,
  amountMinor,
  currency,
  groupName,
  onMarkPaid,
}: {
  member: GroupMember | undefined;
  amountMinor: number;
  currency: string;
  groupName: string;
  onMarkPaid: () => void;
}) {
  const t = useT();
  const online = useOnline();

  return (
    <div className="flex flex-wrap gap-2 pt-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-10"
        disabled={!online}
        onClick={onMarkPaid}
      >
        {t("balances.markPaid")}
      </Button>
      {member?.paypalMeHandle ? (
        <Button asChild variant="outline" size="sm" className="h-10">
          <a
            href={buildPaypalMeLink(
              member.paypalMeHandle,
              minorToMajor(amountMinor, currency),
              currency,
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("balances.payNow")}
          </a>
        </Button>
      ) : (
        member?.paypalEmail && (
          <CopyButton
            value={member.paypalEmail}
            label={t("balances.copyPaypalEmail")}
            copiedLabel={t("balances.paypalEmailCopied")}
          />
        )
      )}
      {member?.iban && (
        <CopyButton
          value={member.iban}
          label={t("balances.copyIban")}
          copiedLabel={t("balances.ibanCopied")}
        />
      )}
      {canUseGiroCode(member, currency) && (
        <GiroCodeDialog
          mode="pay"
          recipientName={giroCodeName(member)}
          iban={member.iban}
          amountMinor={amountMinor}
          groupName={groupName}
        />
      )}
    </div>
  );
}

/**
 * What you can do about money owed *to* you: nudge them with a prefilled
 * WhatsApp message (buildReminderMessage), or — sitting at the same table —
 * show your own GiroCode for them to scan. Paying stays their move; recording
 * it is done on their "you owe" line.
 */
function RemindActions({
  debtorName,
  me,
  amountMinor,
  currency,
  groupId,
  groupName,
}: {
  debtorName: string;
  me: GroupMember | undefined;
  amountMinor: number;
  currency: string;
  groupId: string;
  groupName: string;
}) {
  const t = useT();
  // `window` only exists on the client; until hydration the message just
  // goes without the link back into the group.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
  const message = buildReminderMessage({
    t,
    debtorName,
    groupName,
    amountMinor,
    currency,
    creditor: me ?? { displayName: "" },
    groupUrl: origin ? `${origin}/groups/${groupId}` : null,
  });

  return (
    <div className="flex flex-wrap gap-2 pt-3">
      <Button asChild variant="outline" size="sm" className="h-10">
        <a href={whatsAppShareUrl(message)} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden="true" />
          {t("balances.remind")}
        </a>
      </Button>
      {canUseGiroCode(me, currency) && (
        <GiroCodeDialog
          mode="show"
          recipientName={giroCodeName(me)}
          iban={me.iban}
          amountMinor={amountMinor}
          groupName={groupName}
          payerName={debtorName}
        />
      )}
    </div>
  );
}

/**
 * The first thing on a group's page: where *you* stand, printed as a till
 * receipt. The total is the headline, the people behind it are the line
 * items, dotted leaders run name to amount the way a receipt runs item to
 * price, and a settled slip gets a rubber stamp in the group's own ink.
 *
 * It's cream paper in both themes (`paper-tokens`), the same slip the split
 * games stamp their verdict on: the app already treats a receipt as an
 * object rather than a surface, and this is the one number on the page that
 * earns being the brightest thing on it.
 *
 * Lines come from `simplifyDebts` over net balances, not the raw pairwise
 * ledger: once people settle up through one member, the pairwise ledger
 * shows debts between people who never transacted, while everyone's net
 * position stays correct.
 */
export function BalanceHero({
  groupId,
  groupName,
  balances,
  members,
  currentUid,
  currency,
  isEmpty,
  onShowAll,
}: {
  groupId: string;
  /**
   * Seeds the settled stamp's ink splatter, so it lands the same way every
   * time for this group — and names the group in reminders and GiroCodes.
   */
  groupName: string;
  balances: Record<string, number>;
  members: Record<string, GroupMember>;
  currentUid: string;
  currency: string;
  /** No expenses and no payments yet — there's no balance to speak of. */
  isEmpty: boolean;
  onShowAll: () => void;
}) {
  const t = useT();
  const [settleTarget, setSettleTarget] = useState<{ toUid: string; amountMinor: number } | null>(
    null,
  );

  const totalNet = balances[currentUid] ?? 0;
  const isSettled = totalNet === 0;
  // Captured once: a group that's already square when you open it shows its
  // stamp at rest. The stamp only slams down if it happens while you watch.
  const [settledWhenOpened] = useState(isSettled);

  const lines = simplifyDebts(balances)
    .filter((transfer) => transfer.fromUid === currentUid || transfer.toUid === currentUid)
    .map((transfer) => {
      const youOwe = transfer.fromUid === currentUid;
      const uid = youOwe ? transfer.toUid : transfer.fromUid;
      const name = members[uid]?.displayName ?? "?";
      return {
        uid,
        name,
        youOwe,
        amountMinor: transfer.amountMinor,
        label: youOwe ? t("balances.lineYouOwe", { name }) : t("balances.lineOwesYou", { name }),
      };
    });
  const visibleLines = lines.slice(0, MAX_LINES);
  const hiddenCount = lines.length - visibleLines.length;
  const everyoneSettled = Object.values(balances).every((amount) => amount === 0);

  const eyebrow =
    isEmpty || isSettled
      ? t("balances.heroLabel")
      : totalNet > 0
        ? t("balances.heroOwedToYou")
        : t("balances.heroYouOwe");

  return (
    <section aria-label={t("balances.heroLabel")} className="paper-tokens relative">
      {/* The mask on the slip clips box-shadow, so elevation lives out here as
          a drop-shadow, which follows the torn edges. Fixed ink color rather
          than a theme token: in the dark theme `--foreground` is cream. */}
      <div className="drop-shadow-[0_10px_16px_oklch(0.2_0.05_250/0.3)]">
        <div className="receipt-edges bg-card flex flex-col px-5 pt-6 pb-7">
          <p className="text-muted-foreground font-mono text-[11px] tracking-[0.16em] uppercase">
            {eyebrow}
          </p>

          {isEmpty ? (
            <div className="flex flex-col gap-1 pt-1">
              <p className="font-heading text-2xl leading-tight font-semibold">
                {t("balances.heroEmptyTitle")}
              </p>
              <p className="text-muted-foreground text-sm text-pretty">
                {t("balances.heroEmptyBody")}
              </p>
            </div>
          ) : (
            <>
              <p
                className={cn(
                  "font-heading pt-1 text-[2.75rem] leading-none font-semibold tracking-tight",
                  isSettled
                    ? "text-foreground"
                    : totalNet > 0
                      ? "text-success"
                      : "text-destructive",
                )}
              >
                <AnimatedMoney amountMinor={Math.abs(totalNet)} currency={currency} />
              </p>

              {isSettled ? (
                <p className="text-muted-foreground pt-2 text-sm">
                  {everyoneSettled ? t("balances.heroSettledAll") : t("balances.heroSettledSelf")}
                </p>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="border-foreground/20 mt-4 mb-3 border-t-2 border-dashed"
                  />
                  <ul className="flex flex-col gap-2.5">
                    {visibleLines.map((line, index) => (
                      <li
                        key={line.uid}
                        className="animate-rise flex flex-col"
                        style={{ "--stagger": index + 3 } as CSSProperties}
                      >
                        <div className="flex items-baseline gap-2 text-[0.95rem]">
                          <GameAvatar name={line.name} className="size-5 self-center text-[10px]" />
                          <span className="min-w-0 truncate">{line.label}</span>
                          {/* Dotted leader, item to price. */}
                          <span
                            aria-hidden="true"
                            className="border-foreground/30 min-w-3 flex-1 -translate-y-1 border-b-2 border-dotted"
                          />
                          <span className="tabular-money shrink-0 font-semibold">
                            {formatMoney(line.amountMinor, currency)}
                          </span>
                        </div>
                        {line.youOwe ? (
                          <PayActions
                            member={members[line.uid]}
                            amountMinor={line.amountMinor}
                            currency={currency}
                            groupName={groupName}
                            onMarkPaid={() =>
                              setSettleTarget({ toUid: line.uid, amountMinor: line.amountMinor })
                            }
                          />
                        ) : (
                          <RemindActions
                            debtorName={line.name}
                            me={members[currentUid]}
                            amountMinor={line.amountMinor}
                            currency={currency}
                            groupId={groupId}
                            groupName={groupName}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <button
                type="button"
                onClick={onShowAll}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mt-3 -mb-1 flex min-h-8 w-fit items-center gap-1 self-end rounded-md text-xs font-medium outline-none focus-visible:ring-3"
              >
                {hiddenCount > 0 && `${t("balances.moreLines", { count: hiddenCount })} · `}
                {t("balances.showAll")}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {!isEmpty && isSettled && (
        <InkStamp
          label={t("balances.stampSettled")}
          name={groupName}
          // Success green in every group: a group's own ink can be rose, and
          // on this page red means debt.
          ink="var(--success)"
          animateIn={!settledWhenOpened}
          className="absolute top-5 right-6 z-10 dark:mix-blend-multiply"
        />
      )}

      {settleTarget && (
        <RecordSettlementDialog
          key={settleTarget.toUid}
          groupId={groupId}
          members={members}
          currency={currency}
          currentUid={currentUid}
          prefillFromUid={currentUid}
          prefillToUid={settleTarget.toUid}
          prefillAmountMinor={settleTarget.amountMinor}
          open={true}
          onOpenChange={(open) => {
            if (!open) setSettleTarget(null);
          }}
        />
      )}
    </section>
  );
}
