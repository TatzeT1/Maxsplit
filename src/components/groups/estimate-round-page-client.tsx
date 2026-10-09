"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { AnimatePresence } from "motion/react";
import { Check, CircleAlert, ReceiptText, Wifi } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { EstimateCountdown } from "@/components/groups/split-game/estimate/estimate-countdown";
import { EstimateGuessPanel } from "@/components/groups/split-game/estimate/estimate-guess-input";
import { EstimateInviteCard } from "@/components/groups/split-game/estimate/estimate-invite-card";
import { EstimateQuestionCard } from "@/components/groups/split-game/estimate/estimate-question-card";
import {
  EstimateCatchFlash,
  EstimateRevealView,
} from "@/components/groups/split-game/estimate/estimate-reveal";
import { EstimateSeats } from "@/components/groups/split-game/estimate/estimate-seats";
import { GamePageStage } from "@/components/groups/split-game/game-stage";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { useLocale, useT } from "@/components/locale-provider";
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
  cancelEstimateRound,
  closeEstimateStage,
  submitEstimateGuess,
} from "@/lib/actions/estimate-rounds";
import { callAction } from "@/lib/call-action";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { formatMoney } from "@/lib/format/money";
import {
  ESTIMATE_GRACE_MS,
  ESTIMATE_LAST_CALL_MS,
  absentContenders,
  formatEstimateWithUnit,
  guessDeadlineMs,
  isStageTimedOut,
  nextCloseAction,
} from "@/lib/games/estimate-input";
import { stakeShareAt, type GameStake } from "@/lib/games/payers";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { useDeadlineNow, useEstimateRound } from "@/lib/games/use-estimate-round";
import { isGroupManager } from "@/lib/groups/permissions";
import { useScreenSync } from "@/lib/offline/sync-marks";
import { useLiveSources } from "@/lib/offline/use-live-sources";
import { useOnline } from "@/lib/use-online";
import type { EstimateLocale } from "@/lib/games/estimate-input";
import type { EstimateRound, EstimateStage, Group, GroupMember } from "@/lib/types";

const LIVE_SOURCES = ["group", "round"] as const;

// ---------------------------------------------------------------------------
// The state table (spec G.7): first matching row wins; every combination of
// inputs maps to exactly one view, and none of them is a skeleton forever.
// ---------------------------------------------------------------------------

/** What one listener has told the page. */
export interface SourceState {
  /** A first snapshot has arrived. */
  received: boolean;
  /** Answered from the cache, which holds no copy. */
  cachedEmpty: boolean;
  /** Answered by the server: no such document. */
  missing: boolean;
  /** The document itself. */
  hasData: boolean;
  errorCode: string | null;
}

export type EstimatePageView =
  | { kind: "auth" }
  | { kind: "offline" }
  | { kind: "error"; code: string }
  | { kind: "no-copy" }
  | { kind: "not-found" }
  | { kind: "loading" }
  | { kind: "ready" };

/**
 * Rows 1-6 of the table; `ready` is rows 7-14, which the body tells apart from
 * the round itself. Pure, so the test can enumerate every combination.
 *
 * Offline is `NeedsConnection` for any offline state (no cached read-only
 * running view: a stale guessing stage is stale by definition). "Online but
 * the cache is empty" (lie-fi, a round never opened here) is also
 * `NeedsConnection`, never "not found" — only a server answer is. `loading` is
 * only ever a source that has not yet delivered anything; a snapshot that
 * claims data but carries none is an error, not a wait.
 */
export function estimatePageView(input: {
  signedIn: boolean;
  online: boolean;
  group: SourceState;
  round: SourceState;
}): EstimatePageView {
  const { group, round } = input;
  if (!input.signedIn) return { kind: "auth" };
  if (!input.online) return { kind: "offline" };
  const code = group.errorCode ?? round.errorCode;
  if (code) return { kind: "error", code };
  if (round.cachedEmpty || group.cachedEmpty) return { kind: "no-copy" };
  if (round.missing || group.missing) return { kind: "not-found" };
  if (!round.received || !group.received) return { kind: "loading" };
  if (!round.hasData || !group.hasData) return { kind: "error", code: "empty-snapshot" };
  return { kind: "ready" };
}

interface GroupDocState {
  group: Group | null;
  errorCode: string | null;
  received: boolean;
  cachedEmpty: boolean;
  missing: boolean;
}

const GROUP_INITIAL: GroupDocState = {
  group: null,
  errorCode: null,
  received: false,
  cachedEmpty: false,
  missing: false,
};

/** The group document, live, with the same metadata contract as `useEstimateRound`. */
function useGroupDoc(
  groupId: string,
  enabled: boolean,
  onSnapshotMetadata: (snapshot: { metadata: { fromCache: boolean } }) => void,
): GroupDocState {
  const [held, setHeld] = useState<{ key: string; value: GroupDocState }>({
    key: groupId,
    value: GROUP_INITIAL,
  });
  // An effect event, so an inline callback never resubscribes the listener.
  const report = useEffectEvent(onSnapshotMetadata);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;
        const exists = snapshot.exists();
        setHeld({
          key: groupId,
          value: {
            group: exists ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null,
            errorCode: null,
            received: true,
            cachedEmpty: !exists && fromCache,
            missing: !exists && !fromCache,
          },
        });
        report(snapshot);
      },
      (error) => {
        const errorCode = reportSnapshotError("group", error);
        setHeld((previous) => ({
          key: groupId,
          value: { ...(previous.key === groupId ? previous.value : GROUP_INITIAL), errorCode },
        }));
      },
    );
  }, [groupId, enabled]);

  return held.key === groupId ? held.value : GROUP_INITIAL;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * An online estimate round's page: everyone guesses on their own phone, sees
 * who has answered (never what), and watches the truth land on the number line.
 * Reached from the group banner, the chat's invite card, the challenge push and
 * the public share link; the creator lands here right after starting a round
 * from a new expense, which the round books by itself.
 */
export function EstimateRoundPageClient({
  groupId,
  roundId,
}: {
  groupId: string;
  roundId: string;
}) {
  const t = useT();
  const user = useCurrentUser();
  const online = useOnline();
  const { live, report } = useLiveSources(LIVE_SOURCES);
  useScreenSync(user ? `${user.uid}:estimate:${roundId}` : null, live);

  const groupState = useGroupDoc(groupId, !!user, (snapshot) => report("group", snapshot));
  const roundState = useEstimateRound(groupId, roundId, (snapshot) => report("round", snapshot));
  const closeHref = `/groups/${groupId}`;

  const view = estimatePageView({
    signedIn: !!user,
    online,
    group: { ...groupState, hasData: groupState.group !== null },
    round: { ...roundState, hasData: roundState.round !== null },
  });

  // 2 and 4: nothing to show and nothing to guess on. The clock keeps running.
  if (view.kind === "offline" || view.kind === "no-copy") {
    return <NeedsConnection body={t("offline.estimateNeedsConnection")} />;
  }

  if (view.kind === "error") {
    return (
      <GamePageStage closeHref={closeHref} title={null}>
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: view.code })}</p>
        </div>
        <BackLink href={closeHref} />
      </GamePageStage>
    );
  }

  if (view.kind === "not-found") {
    return (
      <GamePageStage closeHref={closeHref} title={null}>
        <p
          role="status"
          className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm"
        >
          {t("expenses.estimateNotFound")}
        </p>
        <BackLink href={closeHref} />
      </GamePageStage>
    );
  }

  const round = roundState.round;
  const group = groupState.group;
  if (view.kind !== "ready" || !user || !round || !group) {
    return (
      <GamePageStage closeHref={closeHref} title={<Skeleton className="h-7 w-40" />}>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <BackLink href={closeHref} />
      </GamePageStage>
    );
  }

  const meta = SPLIT_GAME_META.estimate;
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
      <EstimateRoundBody groupId={groupId} round={round} group={group} currentUid={user.uid} />
    </GamePageStage>
  );
}

function BackLink({ href, outline = false }: { href: string; outline?: boolean }) {
  const t = useT();
  return (
    <Button asChild variant={outline ? "outline" : "ghost"} size="lg" className="w-full">
      <Link href={href}>{t("common.back")}</Link>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// The body: rows 7-14
// ---------------------------------------------------------------------------

/** `members` completed with the round's name snapshots (somebody who left, a claimed placeholder). */
function withEntrants(
  members: Record<string, GroupMember>,
  round: EstimateRound,
): Record<string, GroupMember> {
  const merged: Record<string, GroupMember> = { ...members };
  for (const [uid, entrant] of Object.entries(round.entrants)) {
    if (Object.hasOwn(merged, uid)) continue;
    merged[uid] = {
      displayName: entrant.displayName,
      photoURL: "",
      joinedAt: round.createdAt,
      role: "member",
      isPlaceholder: entrant.isPlaceholder,
    };
  }
  return merged;
}

interface AnnounceMemo {
  stageCount: number;
  lastStatus: EstimateStage["status"];
  submitted: readonly string[];
  text: string;
}

/**
 * The polite status text for what changed since `previous`: who has locked
 * (counts and names only — a value is not in the client before the reveal),
 * the truth when a stage is revealed, and who plays the Stechfrage. Returns
 * `previous` itself when nothing changed, so it is safe to set state from. The
 * first call announces nothing: what is already on screen is not news.
 */
function nextAnnouncement(
  previous: AnnounceMemo | null,
  round: EstimateRound,
  t: ReturnType<typeof useT>,
  locale: EstimateLocale,
  nameOf: (uid: string) => string,
): AnnounceMemo {
  const last = round.stages[round.stages.length - 1];
  const current = {
    stageCount: round.stages.length,
    lastStatus: last.status,
    submitted: last.submitted,
  };
  if (!previous) return { ...current, text: "" };

  let text = previous.text;
  const settled = round.stages[previous.stageCount - 1];
  if (
    round.stages.length > previous.stageCount ||
    (previous.lastStatus === "guessing" && settled?.status === "revealed")
  ) {
    const parts: string[] = [];
    if (settled?.reveal && previous.lastStatus === "guessing") {
      parts.push(
        t("expenses.estimateAnnounceReveal", {
          truth: formatEstimateWithUnit(settled.reveal.truthMilli, settled.question, locale),
        }),
      );
    }
    if (round.stages.length > previous.stageCount) {
      parts.push(
        t("expenses.estimateAnnounceStechen", {
          names: new Intl.ListFormat(locale).format(last.contenders.map(nameOf)),
        }),
      );
    }
    text = parts.join(" ");
  } else if (last.submitted.length > previous.submitted.length) {
    const fresh = last.submitted.filter((uid) => !previous.submitted.includes(uid));
    if (fresh.length > 0) {
      text = t("expenses.estimateAnnounceLocked", {
        name: nameOf(fresh[fresh.length - 1]),
        done: last.submitted.length,
        total: last.contenders.length,
      });
    }
  }

  if (
    text === previous.text &&
    current.stageCount === previous.stageCount &&
    current.lastStatus === previous.lastStatus &&
    current.submitted.length === previous.submitted.length
  ) {
    return previous;
  }
  return { ...current, text };
}

function EstimateRoundBody({
  groupId,
  round,
  group,
  currentUid,
}: {
  groupId: string;
  round: EstimateRound;
  group: Group;
  currentUid: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const online = useOnline();
  const [shakeRef, catches] = useCatchFlashes();

  const members = withEntrants(group.members, round);
  const nameOf = (uid: string) => (Object.hasOwn(members, uid) ? members[uid].displayName : "?");
  const stake: GameStake | null = round.stake;
  const closeHref = `/groups/${groupId}`;

  const stages = round.stages;
  const stage = stages[stages.length - 1];
  const running = round.status === "running";
  const guessing = running && stage.status === "guessing";

  // Time is display only; the server decides the deadline (`closesAt + grace`).
  const now = useDeadlineNow(guessing ? guessDeadlineMs(stage) : null, guessing);
  const timedOut = guessing && isStageTimedOut(stage, now);

  // A stage seen "guessing" in THIS mount and later revealed plays its reveal;
  // a round opened already finished, or a past stage, shows at once.
  const [seenGuessing, setSeenGuessing] = useState<readonly number[]>([]);
  if (stage.status === "guessing" && !seenGuessing.includes(stage.index)) {
    setSeenGuessing([...seenGuessing, stage.index]);
  }
  const [settledStages, setSettledStages] = useState<readonly number[]>([]);
  const markSettled = (index: number) =>
    setSettledStages((previous) => (previous.includes(index) ? previous : [...previous, index]));

  const [memo, setMemo] = useState<AnnounceMemo | null>(null);
  const nextMemo = nextAnnouncement(memo, round, t, locale, nameOf);
  if (nextMemo !== memo) setMemo(nextMemo);

  // My own lock, ahead of the stage listener confirming it through `submitted`.
  const [lockedStage, setLockedStage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    stage: number;
    text: string;
    kind: "error" | "info";
  } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  let revealStage: EstimateStage | null = null;
  for (const candidate of stages) {
    if (candidate.status === "revealed") revealStage = candidate;
  }
  const revealAnimates = !!revealStage && seenGuessing.includes(revealStage.index);
  const revealPending =
    !!revealStage && revealAnimates && running && !settledStages.includes(revealStage.index);
  const revealExpanded =
    !!revealStage && (!running || revealStage.index === stage.index || revealPending);
  const history = stages.filter(
    (candidate) =>
      candidate.status === "revealed" &&
      !(revealExpanded && candidate.index === revealStage?.index),
  );

  const isEntrant = Object.hasOwn(round.entrants, currentUid);
  const canManage =
    round.createdBy === currentUid || isGroupManager(group.members[currentUid]?.role);
  const mine = stage.contenders.includes(currentUid);
  const lockedByMe = stage.submitted.includes(currentUid) || lockedStage === stage.index;
  const canGuessNow = guessing && mine && !lockedByMe && !timedOut;
  const canClose = isEntrant || canManage;
  const lastCall = stage.lastCallAt !== null;
  const noticeHere = notice && notice.stage === stage.index ? notice : null;

  function fail(code: string, scope: "lock" | "close" | "cancel"): string {
    const q = stage.question;
    switch (code) {
      case "stage-closed":
        return t("expenses.estimateStageClosed");
      case "stale-stage":
      case "round-not-running":
        return t("expenses.estimateStaleStage");
      case "guess-zero":
        return t("expenses.estimateGuessZero");
      case "guess-not-whole":
        return t("expenses.estimateGuessNotWhole");
      case "guess-below-min":
        return t("expenses.estimateGuessBelowMin", {
          min: formatEstimateWithUnit(q.bounds.minMilli, q, locale),
        });
      case "guess-above-max":
        return t("expenses.estimateGuessAboveMax", {
          max: formatEstimateWithUnit(q.bounds.maxMilli, q, locale),
        });
      case "guess-invalid":
        return t("expenses.estimateParseTooLong");
      case "time-not-up": {
        if (stage.lastCallAt === null) return t("expenses.estimateTimeNotUp");
        const deadline = guessDeadlineMs(stage);
        const remaining = deadline === null ? 0 : Math.max(0, deadline - Date.now());
        const minutes = Math.floor(Math.ceil(remaining / 1000) / 60);
        const seconds = Math.ceil(remaining / 1000) % 60;
        return t("expenses.estimateLastCallRunning", {
          time: `${minutes}:${String(seconds).padStart(2, "0")}`,
        });
      }
      case "not-a-contender":
        return t("expenses.estimateSpectator");
      case "network":
        return t("errors.notSaved");
      default:
        return scope === "lock"
          ? t("expenses.estimateSubmitError")
          : t("expenses.estimateActionError");
    }
  }

  async function lock(guessMilli: number) {
    if (busy) return;
    const stageIndex = stage.index;
    setBusy(true);
    setNotice(null);
    const result = await callAction(() =>
      submitEstimateGuess({ groupId, roundId: round.id, stageIndex, guessMilli }),
    );
    setBusy(false);
    if (!result.ok) {
      setNotice({ stage: stageIndex, text: fail(result.error, "lock"), kind: "error" });
      return;
    }
    setLockedStage(stageIndex);
  }

  async function close() {
    if (busy) return;
    const stageIndex = stage.index;
    setBusy(true);
    setNotice(null);
    const result = await callAction(() =>
      closeEstimateStage({ groupId, roundId: round.id, stageIndex }),
    );
    setBusy(false);
    if (!result.ok) {
      setNotice({ stage: stageIndex, text: fail(result.error, "close"), kind: "error" });
      return;
    }
    if (!result.data.closed) {
      setNotice({
        stage: stageIndex,
        text: t("expenses.estimateLastCallStarted", { minutes: ESTIMATE_LAST_CALL_MS / 60_000 }),
        kind: "info",
      });
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await callAction(() => cancelEstimateRound({ groupId, roundId: round.id }));
    setBusy(false);
    if (!result.ok) {
      setNotice({ stage: stage.index, text: fail(result.error, "cancel"), kind: "error" });
    }
  }

  const stakeLine = stake ? (
    <p className="text-center text-sm">
      {stake.description} ·{" "}
      <span className="font-heading tabular-money font-medium">
        {formatMoney(stake.amountMinor, stake.currency)}
      </span>
    </p>
  ) : null;

  const showInvite = running && stages.length === 1 && stage.submitted.length === 0;
  const showCancel = showInvite && canManage;

  return (
    <>
      <div ref={shakeRef} className="flex flex-col gap-4">
        {stakeLine}

        {round.status === "cancelled" ? (
          <>
            <p
              role="status"
              className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm"
            >
              {t("expenses.estimateCancelled")}
            </p>
            <BackLink href={closeHref} outline />
          </>
        ) : (
          <>
            {revealExpanded && revealStage && (
              <EstimateRevealView
                key={revealStage.index}
                round={round}
                stageIndex={revealStage.index}
                members={members}
                stake={stake}
                animate={revealAnimates}
                inDialog={false}
                currentUid={currentUid}
                catches={catches}
                onSettled={() => markSettled(revealStage.index)}
              />
            )}

            {round.status === "finished" &&
              (round.expenseId ? (
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
              ) : null)}

            {history.length > 0 && (
              <div className="flex flex-col gap-2">
                {history.map((past) => (
                  <details
                    key={past.index}
                    data-slot="estimate-history"
                    className="bg-card ring-foreground/10 rounded-xl p-3 ring-1"
                  >
                    <summary className="min-h-6 cursor-pointer text-sm font-medium">
                      {past.kind === "main"
                        ? t("expenses.estimateStageMain")
                        : t("expenses.estimateStageStechen", { count: past.index })}
                    </summary>
                    <div className="pt-3">
                      <EstimateRevealView
                        round={round}
                        stageIndex={past.index}
                        members={members}
                        stake={stake}
                        animate={false}
                        inDialog={false}
                        currentUid={currentUid}
                        catches={catches}
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}

            {guessing && !revealPending && (
              <>
                {canGuessNow ? (
                  <EstimateGuessPanel
                    key={`${round.id}:${stage.index}:${currentUid}`}
                    question={stage.question}
                    stageIndex={stage.index}
                    stageKind={stage.kind}
                    heading={t("expenses.estimateGuessLabel")}
                    busy={busy}
                    disabledReason={online ? null : t("expenses.estimateNeedsConnection")}
                    error={noticeHere?.kind === "error" ? noticeHere.text : null}
                    keepOnError
                    onLock={(milli) => void lock(milli)}
                  />
                ) : (
                  <>
                    <EstimateQuestionCard
                      compact
                      question={stage.question}
                      stageIndex={stage.index}
                      stageKind={stage.kind}
                    />
                    {!mine ? (
                      <p role="status" className="text-muted-foreground text-center text-sm">
                        {t("expenses.estimateSpectator")}
                      </p>
                    ) : lockedByMe ? (
                      <div role="status" className="flex flex-col items-center gap-1 text-center">
                        {lockedStage === stage.index && (
                          <p className="text-success flex items-center gap-1.5 text-sm font-medium">
                            <Check aria-hidden="true" className="size-4" />
                            {t("expenses.estimateLocked")}
                          </p>
                        )}
                        <p className="text-muted-foreground text-sm">
                          {t("expenses.estimateWaitingOthers")}
                        </p>
                      </div>
                    ) : null}
                  </>
                )}

                {timedOut ? (
                  <section
                    data-slot="estimate-time-up"
                    className="flex flex-col items-center gap-2 text-center"
                  >
                    <p role="status" className="text-sm font-medium">
                      {t("expenses.estimateTimeUp")}
                    </p>
                    {canClose && (
                      <CloseControl
                        round={round}
                        stage={stage}
                        now={now}
                        online={online}
                        busy={busy}
                        open={confirmClose}
                        onOpenChange={setConfirmClose}
                        nameOf={nameOf}
                        onConfirm={() => void close()}
                      />
                    )}
                  </section>
                ) : (
                  stage.closesAt && (
                    <EstimateCountdown
                      closesAt={stage.closesAt}
                      graceMs={ESTIMATE_GRACE_MS}
                      lastCall={lastCall}
                    />
                  )
                )}

                {noticeHere && !(canGuessNow && noticeHere.kind === "error") && (
                  <p
                    role={noticeHere.kind === "error" ? "alert" : "status"}
                    className={
                      noticeHere.kind === "error"
                        ? "text-destructive text-center text-sm"
                        : "text-muted-foreground text-center text-sm"
                    }
                  >
                    {noticeHere.text}
                  </p>
                )}

                <EstimateSeats
                  stage={stage}
                  round={round}
                  members={members}
                  currentUid={currentUid}
                />

                {showInvite && (
                  <EstimateInviteCard
                    groupId={groupId}
                    round={round}
                    members={members}
                    currentUid={currentUid}
                    gameTitle={t(SPLIT_GAME_META.estimate.nameKey)}
                  />
                )}

                {showCancel && (
                  <div className="flex justify-center">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive h-10"
                          disabled={!online || busy}
                        >
                          {t("expenses.estimateCancel")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("expenses.estimateCancelConfirm")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("expenses.estimateCancelConfirmBody")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => void cancel()}>
                            {t("expenses.estimateCancel")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </>
            )}

            {/* Every state with a stage carries a visible way back: the corner ✕ can sit under the offline banner. */}
            <BackLink href={closeHref} outline={!running} />
          </>
        )}
      </div>

      {/* Counts, names and the truth after the reveal — never a value before it. */}
      <p role="status" aria-live="polite" className="sr-only">
        {nextMemo.text}
      </p>

      {/* A direct child of the stage column, so the slip's containing block is the fixed stage frame. */}
      <AnimatePresence>
        {catches.flash && revealStage && (
          <EstimateCatchFlash
            key={catches.flash.id}
            flash={catches.flash}
            round={round}
            stageIndex={revealStage.index}
            members={members}
            stake={stake}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * "Letzte Chance senden" / "Jetzt auswerten" behind a confirmation that names
 * who counts as absent and what that costs them, so nobody scores a round
 * without seeing who pays for the missing answers.
 */
function CloseControl({
  round,
  stage,
  now,
  online,
  busy,
  open,
  onOpenChange,
  nameOf,
  onConfirm,
}: {
  round: EstimateRound;
  stage: EstimateStage;
  now: number;
  online: boolean;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nameOf: (uid: string) => string;
  onConfirm: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const action = nextCloseAction(stage, now);
  if (action === "wait") return null;

  const absent = absentContenders(stage);
  const names = new Intl.ListFormat(locale).format(absent.map(nameOf));
  const lastCallAction = action === "last-call";
  const stake = round.stake;
  // Payers still to find in this stage; the largest share is the first payer's.
  const share = stakeShareAt(stake, round.targetLoserCount, 0);
  const cost =
    stake && share !== null
      ? absent.length <= stage.slots
        ? t("expenses.estimateCloseCostPays", {
            names,
            share: formatMoney(share, stake.currency),
          })
        : t("expenses.estimateCloseCostLot", { names, share: formatMoney(share, stake.currency) })
      : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="lg" disabled={!online || busy}>
          {lastCallAction ? t("expenses.estimateLastCallButton") : t("expenses.estimateCloseNow")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {lastCallAction
              ? t("expenses.estimateLastCallTitle")
              : t("expenses.estimateCloseConfirm")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {lastCallAction
              ? t("expenses.estimateLastCallBody", {
                  names,
                  minutes: ESTIMATE_LAST_CALL_MS / 60_000,
                })
              : t("expenses.estimateCloseConfirmBody", { names })}
            {cost && <span className="mt-2 block font-medium">{cost}</span>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={!online || busy} onClick={onConfirm}>
            {lastCallAction
              ? t("expenses.estimateLastCallConfirm")
              : t("expenses.estimateCloseNow")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
