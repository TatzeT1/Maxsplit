"use client";

import { useState } from "react";
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
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import { playAppliedSound, playLaughSound, playTapSound } from "@/lib/sound/lottery-sounds";
import type { GroupMember } from "@/lib/types";

type Outcome = "pay" | "safe";

interface LotteryCell {
  outcome: Outcome;
  revealed: boolean;
  tappedByUid: string | null;
}

const GRID_SIZE_OPTIONS = [16, 20, 24, 28, 32];

function randomBytes(length: number): Uint32Array {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Like the source party game: the grid is always 16-32 anonymous faces, independent of how many people are actually playing. */
function randomGridSize(): number {
  const bytes = randomBytes(1);
  return GRID_SIZE_OPTIONS[bytes[0] % GRID_SIZE_OPTIONS.length];
}

/** Fisher-Yates shuffle of `payCount` "pay" outcomes among `total` cells, using crypto randomness so the draw can't be predicted or replayed. */
function shuffledOutcomes(total: number, payCount: number): Outcome[] {
  const outcomes: Outcome[] = Array.from({ length: total }, (_, index) =>
    index < payCount ? "pay" : "safe",
  );
  const bytes = randomBytes(outcomes.length);
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  return outcomes;
}

type Step = "setup" | "playing";

/**
 * "Pass the phone" lottery for picking who pays an expense, modeled on the
 * tap-to-reveal party game it's inspired by: a grid of 16-32 anonymous faces
 * (always that many, regardless of how many people are actually playing),
 * everyone in the pool taps one face per turn in round-robin order, until a
 * fixed number of "laughing" faces have been found. Whoever tapped one pays.
 * Resolves to a list of payer uids that the caller wires into `paidBy`; it
 * never touches `splits`, which stays governed by the expense's own split mode.
 */
export function PayerLotteryDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  onResolve: (payerUids: string[]) => void;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>("setup");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [payerCountInput, setPayerCountInput] = useState("1");
  const [targetPayerCount, setTargetPayerCount] = useState(1);
  const [cells, setCells] = useState<LotteryCell[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  function startGame() {
    const requested = Number.parseInt(payerCountInput, 10) || 1;
    const target = Math.min(Math.max(requested, 1), poolUids.length);
    const size = randomGridSize();
    const outcomes = shuffledOutcomes(size, target);
    setCells(outcomes.map((outcome) => ({ outcome, revealed: false, tappedByUid: null })));
    setTargetPayerCount(target);
    setTurnIndex(0);
    setStep("playing");
  }

  const payerUids = [
    ...new Set(
      cells
        .filter((cell) => cell.revealed && cell.outcome === "pay")
        .map((cell) => cell.tappedByUid as string),
    ),
  ];
  const gameOver = payerUids.length >= targetPayerCount;
  const currentTurnUid = poolUids[turnIndex % poolUids.length];

  function tapCell(index: number) {
    if (gameOver) return;
    const cell = cells[index];
    if (cell.revealed) return;

    const tapperUid = currentTurnUid;
    setCells((current) =>
      current.map((c, i) => (i === index ? { ...c, revealed: true, tappedByUid: tapperUid } : c)),
    );
    if (cell.outcome === "pay") {
      playLaughSound();
    } else {
      playTapSound();
    }
    setTurnIndex((i) => i + 1);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      setCells([]);
      setTurnIndex(0);
    }
    onOpenChange(nextOpen);
  }

  function applyResult() {
    playAppliedSound();
    onResolve(payerUids);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("expenses.lotteryTitle")}</DialogTitle>
        </DialogHeader>

        {step === "setup" ? (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-muted-foreground text-sm">{t("expenses.lotteryIntro")}</p>
            <div className="flex flex-col gap-2">
              <Label>{t("expenses.lotteryPoolLabel")}</Label>
              {memberUids.map((uid) => (
                <label key={uid} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={poolUids.includes(uid)}
                    onChange={() => togglePoolMember(uid)}
                    className="accent-primary size-4"
                  />
                  {members[uid].displayName}
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lottery-payer-count">{t("expenses.lotteryCountLabel")}</Label>
              <Input
                id="lottery-payer-count"
                value={payerCountInput}
                onChange={(event) => setPayerCountInput(event.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {!gameOver ? (
              <div className="flex flex-col gap-1">
                <p className="text-center text-sm font-medium">
                  {t("expenses.lotteryTurnLabel", { name: members[currentTurnUid].displayName })}
                </p>
                <p className="text-muted-foreground text-center text-xs">
                  {t("expenses.lotteryTapAnyHint")}
                </p>
                <p className="text-muted-foreground text-center text-xs">
                  {t("expenses.lotteryProgress", {
                    found: payerUids.length,
                    target: targetPayerCount,
                  })}
                </p>
              </div>
            ) : (
              <p className="text-center text-sm font-medium">
                {payerUids.length === 1
                  ? t("expenses.lotteryResultOne", {
                      name: members[payerUids[0]].displayName,
                    })
                  : t("expenses.lotteryResultMultiple", {
                      names: payerUids.map((uid) => members[uid].displayName).join(", "),
                    })}
              </p>
            )}

            <div className="grid grid-cols-6 gap-1.5">
              {cells.map((cell, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => tapCell(index)}
                  disabled={cell.revealed || gameOver}
                  aria-label={
                    cell.revealed
                      ? cell.outcome === "pay"
                        ? t("expenses.lotteryRevealPay")
                        : t("expenses.lotterySafe")
                      : undefined
                  }
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border text-lg transition-all duration-200 active:scale-90",
                    cell.revealed
                      ? cell.outcome === "pay"
                        ? "border-destructive bg-destructive/10"
                        : "border-border bg-muted"
                      : gameOver
                        ? "border-border bg-background opacity-40"
                        : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <span
                    key={cell.revealed ? "revealed" : "hidden"}
                    className="animate-in zoom-in-50 fade-in duration-200"
                  >
                    {cell.revealed ? (cell.outcome === "pay" ? "😂" : "🙂") : "❓"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "setup" ? (
            <Button
              type="button"
              className="w-full"
              disabled={poolUids.length < 2}
              onClick={startGame}
            >
              {t("expenses.lotteryStart")}
            </Button>
          ) : (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("setup")}
              >
                {t("expenses.lotteryPlayAgain")}
              </Button>
              <Button type="button" className="flex-1" disabled={!gameOver} onClick={applyResult}>
                {t("expenses.lotteryApply")}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
