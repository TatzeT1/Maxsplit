"use client";

import { Gamepad2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GamePoolChecklist } from "@/components/groups/split-game/game-pool-checklist";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTournament } from "@/lib/actions/tournaments";
import { formatMoney, parseMoneyInput } from "@/lib/format/money";
import { DUEL_GAME_IDS, DUEL_GAME_META } from "@/lib/games/duel-game-ids";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type { DuelGameId, Group } from "@/lib/types";

/** Local calendar day as `YYYY-MM-DD` — what an expense's `date` field holds. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * "Spiel starten": a duel that isn't tied to an expense form. Everyone plays
 * on their own phone. The stake is optional — 0 € (the default) is a game
 * just for fun; with an amount, the losers split it and the winner is booked
 * as the one who paid, so the ordinary balances settle it. A stake game runs
 * until one player is left standing (everyone else is a loser).
 */
export function StartGameDialog({
  open,
  onOpenChange,
  groupId,
  group,
  currentUid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  group: Group;
  currentUid: string;
}) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const currency = group.currency;

  // Online needs a phone: placeholders (members without an account) can't play.
  const memberUids = Object.keys(group.members).filter(
    (uid) => group.members[uid].isPlaceholder !== true,
  );
  const [gameId, setGameId] = useState<DuelGameId>("memory");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [stakeInput, setStakeInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedStake = stakeInput.trim() === "" ? 0 : parseMoneyInput(stakeInput);
  const stakeMinor = parsedStake ?? 0;
  const stakeInvalid = parsedStake === null;
  const canStart = poolUids.length >= 2 && !stakeInvalid && online && !starting;

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  async function start() {
    if (!canStart) return;
    setStarting(true);
    setError(null);
    const meta = DUEL_GAME_META[gameId];
    const pool = poolUids.includes(currentUid) ? poolUids : [currentUid, ...poolUids];
    const result = await createTournament({
      groupId,
      gameId,
      poolUids: pool,
      // A stake needs exactly one winner: play until everyone else has lost.
      targetLoserCount: stakeMinor > 0 ? pool.length - 1 : 1,
      stake: null,
      playMode: "online",
      autoBook:
        stakeMinor > 0
          ? {
              description: t(meta.titleKey),
              amountMinor: stakeMinor,
              currency,
              date: today(),
              category: null,
              emoji: meta.emoji,
              paidBy: {},
              payerIsWinner: true,
            }
          : null,
    }).catch(() => ({ ok: false as const, error: "network" }));
    setStarting(false);
    if (!result.ok) {
      setError(
        result.error === "tournament-running"
          ? t("expenses.tournamentAlreadyRunning")
          : t("expenses.tournamentStartError"),
      );
      return;
    }
    onOpenChange(false);
    router.push(`/groups/${groupId}/tournaments/${result.data.tournamentId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 aria-hidden="true" className="size-5" />
            {t("expenses.startGameTitle")}
          </DialogTitle>
          <DialogDescription>{t("expenses.startGameIntro")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label id="start-game-label">{t("expenses.startGameWhich")}</Label>
            <div
              role="radiogroup"
              aria-labelledby="start-game-label"
              className="grid grid-cols-2 gap-2"
            >
              {DUEL_GAME_IDS.map((id) => {
                const meta = DUEL_GAME_META[id];
                const selected = id === gameId;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setGameId(id)}
                    className={cn(
                      "flex min-h-12 items-center gap-2 rounded-xl border p-2.5 text-left text-sm font-medium transition-colors active:scale-[0.99]",
                      selected ? "border-primary/40 bg-primary/5 shadow-e1" : "bg-background",
                    )}
                  >
                    <span aria-hidden="true" className="text-xl">
                      {meta.emoji}
                    </span>
                    <span className="truncate">{t(meta.titleKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <GamePoolChecklist
            memberUids={memberUids}
            members={group.members}
            poolUids={poolUids}
            onTogglePoolMember={togglePoolMember}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="start-game-stake">{t("expenses.startGameStake")}</Label>
            <div className="relative">
              <Input
                id="start-game-stake"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={stakeInput}
                onChange={(event) => setStakeInput(event.target.value)}
                aria-invalid={stakeInvalid}
                className="pr-10"
              />
              <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
                {currency === "EUR" ? "€" : currency}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              {stakeInvalid
                ? t("expenses.startGameStakeInvalid")
                : stakeMinor > 0
                  ? t("expenses.startGameStakeHint", { amount: formatMoney(stakeMinor, currency) })
                  : t("expenses.startGameNoStakeHint")}
            </p>
          </div>

          {!online && (
            <p role="alert" className="text-destructive text-sm">
              {t("offline.gameNeedsConnection")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            size="lg"
            className="flex-1"
            disabled={!canStart}
            onClick={() => void start()}
          >
            {starting ? t("common.loading") : t("expenses.duelOnlineStart")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
