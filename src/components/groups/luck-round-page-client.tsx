"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { CircleAlert, ReceiptText, Wifi } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GamePageStage } from "@/components/groups/split-game/game-stage";
import { ScratchCard } from "@/components/groups/split-game/scratch-card";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cancelLuckRound,
  revealRemainingCards,
  revealScratchCard,
} from "@/lib/actions/luck-rounds";
import type { ActionResult } from "@/lib/actions/groups";
import { callAction } from "@/lib/call-action";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { formatMoney } from "@/lib/format/money";
import { canScratchFor, unrevealedUids } from "@/lib/games/luck-round";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { useLuckRound } from "@/lib/games/use-luck-round";
import { isGroupManager } from "@/lib/groups/permissions";
import { playLaughSound, playMissSound, playStampSound } from "@/lib/sound/game-sounds";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type { Group, GroupMember, LuckRound } from "@/lib/types";

/**
 * An online luck round's page — for now the scratch cards: every player
 * scratches their own card on their own phone, and watches the others'
 * foil drop live. Reached from the group page's banner, the chat's join
 * card and the challenge push; the round's creator lands here straight
 * after starting it from a new expense, which the round books by itself.
 */
export function LuckRoundPageClient({ groupId, roundId }: { groupId: string; roundId: string }) {
  const t = useT();
  const user = useCurrentUser();
  const online = useOnline();
  const [group, setGroup] = useState<Group | null>(null);
  const [groupErrorCode, setGroupErrorCode] = useState<string | null>(null);
  const { round, errorCode: roundErrorCode, missing } = useLuckRound(groupId, roundId);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
      },
      (error) => {
        setGroupErrorCode(reportSnapshotError("group", error));
      },
    );
  }, [groupId, user]);

  const errorCode = groupErrorCode ?? roundErrorCode;
  const closeHref = `/groups/${groupId}`;

  // Every card is drawn by the server; offline there's nothing to scratch.
  if (user && !online) {
    return <NeedsConnection body={t("offline.gameNeedsConnection")} />;
  }

  if (user && (errorCode || missing)) {
    return (
      <GamePageStage closeHref={closeHref} title={null}>
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">
            {missing ? t("expenses.luckNotFound") : t("errors.dataLoadFailed")}
          </p>
          {errorCode && <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>}
        </div>
      </GamePageStage>
    );
  }

  if (!group || !round || !user) {
    return (
      <GamePageStage closeHref={closeHref} title={<Skeleton className="h-7 w-40" />}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </GamePageStage>
    );
  }

  // Falls back to the round's own name snapshot for someone the group no
  // longer has (they left, or a placeholder got claimed since).
  const members: Record<string, GroupMember> = { ...group.members };
  for (const [uid, entrant] of Object.entries(round.entrants)) {
    if (!members[uid]) {
      members[uid] = {
        displayName: entrant.displayName,
        photoURL: "",
        joinedAt: round.createdAt,
        role: "member",
        isPlaceholder: entrant.isPlaceholder,
      };
    }
  }
  const meta = SPLIT_GAME_META[round.gameId];

  return (
    <GamePageStage
      closeHref={closeHref}
      title={
        <h1 className="font-heading flex min-w-0 items-center gap-2 text-lg font-semibold">
          <span aria-hidden="true">{meta.emoji}</span>
          <span className="truncate">{t(meta.nameKey)}</span>
          <span className="bg-primary/10 text-primary flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold tracking-[0.08em] uppercase">
            <Wifi aria-hidden="true" className="size-3" />
            {t("expenses.luckOnlineBadge")}
          </span>
        </h1>
      }
    >
      <LuckRoundBody
        groupId={groupId}
        round={round}
        members={members}
        currentUid={user.uid}
        canManage={round.createdBy === user.uid || isGroupManager(group.members[user.uid]?.role)}
      />
    </GamePageStage>
  );
}

function LuckRoundBody({
  groupId,
  round,
  members,
  currentUid,
  canManage,
}: {
  groupId: string;
  round: LuckRound;
  members: Record<string, GroupMember>;
  currentUid: string;
  canManage: boolean;
}) {
  const t = useT();
  const online = useOnline();
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const running = round.status === "running";
  const scratchedCount = Object.keys(round.revealed).length;
  const playing = currentUid in round.entrants;
  const mineOpen = playing && currentUid in round.revealed;
  const left = unrevealedUids(round);
  const nameOf = (uid: string) => members[uid]?.displayName ?? "?";

  async function reveal(uid: string) {
    if (pendingUid) return;
    setPendingUid(uid);
    setError(null);
    const result = await callAction(() =>
      revealScratchCard({ groupId, roundId: round.id, cardUid: uid }),
    );
    setPendingUid(null);
    if (!result.ok) {
      setError(t("expenses.luckRevealError"));
      return;
    }
    if (result.data.pays) {
      playStampSound();
      playLaughSound(0.1);
    } else {
      playMissSound();
    }
  }

  async function run(action: () => Promise<ActionResult<null>>) {
    setBusy(true);
    setError(null);
    const result = await callAction(action);
    setBusy(false);
    if (!result.ok) setError(t("expenses.luckActionError"));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm">
        {round.stake.description} ·{" "}
        <span className="font-heading tabular-money font-medium">
          {formatMoney(round.stake.amountMinor, round.stake.currency)}
        </span>
      </p>

      {round.status === "finished" && round.loserUids ? (
        <div className="flex flex-col gap-3">
          <GameResultBanner loserUids={round.loserUids} members={members} inDialog={false} />
          {round.expenseId ? (
            <p className="text-success flex items-center justify-center gap-1.5 text-sm font-medium">
              <ReceiptText aria-hidden="true" className="size-4" />
              {t("expenses.onlineBooked")}
            </p>
          ) : round.autoBookError ? (
            <p
              role="alert"
              className="text-destructive flex items-start justify-center gap-1.5 text-center text-sm"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("expenses.onlineBookFailed")}
            </p>
          ) : null}
        </div>
      ) : round.status === "cancelled" ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
          {t("expenses.luckCancelled")}
        </p>
      ) : (
        <p className="text-muted-foreground text-center text-xs">
          {!playing
            ? t("expenses.luckSpectator")
            : mineOpen
              ? t("expenses.luckWaitingOthers")
              : t("expenses.luckScratchHint")}
        </p>
      )}

      <GameProgressPips
        revealedCount={scratchedCount}
        target={round.order.length}
        progressLabel={t("expenses.scratchProgress", {
          found: scratchedCount,
          target: round.order.length,
        })}
      />

      <div className="mx-auto grid w-full max-w-lg grid-cols-3 gap-2">
        {round.order.map((uid) => {
          const mine = uid === currentUid;
          const mayScratch = running && canScratchFor(round, currentUid, uid);
          return (
            <div key={uid} className="flex min-w-0 flex-col gap-1">
              <div className={cn("rounded-xl", mine && "ring-primary ring-2 ring-offset-2")}>
                <ScratchCard
                  name={nameOf(uid)}
                  isLoser={round.revealed[uid] ?? null}
                  scratched={uid in round.revealed}
                  onReveal={() => void reveal(uid)}
                  disabled={!mayScratch || !online}
                  pending={pendingUid === uid}
                  // "Du zahlst!" is for your own card; on anyone else's it's "Zahlt!".
                  payLabel={mine ? undefined : t("expenses.scratchResultPayOther")}
                />
              </div>
              <span
                className={cn(
                  "truncate text-center text-xs",
                  mine ? "text-primary font-semibold" : "text-muted-foreground",
                )}
              >
                {mine
                  ? t("expenses.luckYourCard")
                  : mayScratch
                    ? t("expenses.luckForPlaceholder", { name: nameOf(uid) })
                    : nameOf(uid)}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-center text-sm">
          {error}
        </p>
      )}

      {round.status !== "running" && (
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href={`/groups/${groupId}`}>{t("common.back")}</Link>
        </Button>
      )}

      {running && canManage && (
        <div className="flex flex-col items-center gap-1">
          {left.length > 0 && scratchedCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="h-10" disabled={busy}>
                  {t("expenses.luckRevealRest")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("expenses.luckRevealRestConfirm")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("expenses.luckRevealRestConfirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      void run(() => revealRemainingCards({ groupId, roundId: round.id }))
                    }
                  >
                    {t("expenses.luckRevealRest")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {scratchedCount === 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive h-10"
                  disabled={busy}
                >
                  {t("expenses.luckCancel")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("expenses.luckCancelConfirm")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("expenses.luckCancelConfirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void run(() => cancelLuckRound({ groupId, roundId: round.id }))}
                  >
                    {t("expenses.luckCancel")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}
