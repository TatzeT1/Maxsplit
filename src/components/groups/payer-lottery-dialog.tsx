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
import type { GroupMember } from "@/lib/types";

type Outcome = "pay" | "safe";

interface LotteryCard {
  uid: string;
  outcome: Outcome;
  revealed: boolean;
}

/** Fisher-Yates shuffle of `payCount` "pay" outcomes among `total` cards, using crypto randomness so the draw can't be predicted or replayed. */
function shuffledOutcomes(total: number, payCount: number): Outcome[] {
  const outcomes: Outcome[] = Array.from({ length: total }, (_, index) =>
    index < payCount ? "pay" : "safe",
  );
  const randomBytes = new Uint32Array(outcomes.length);
  crypto.getRandomValues(randomBytes);
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = randomBytes[i] % (i + 1);
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  return outcomes;
}

type Step = "setup" | "playing";

/**
 * "Pass the phone" lottery for picking who pays an expense: everyone in the
 * pool gets one face-down card, a fixed number of which are secretly "pay" —
 * tapping a card reveals only that person's own outcome. Resolves to a list
 * of payer uids that the caller wires into `paidBy`; it never touches
 * `splits`, which stays governed by the expense's own split mode.
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
  const [cards, setCards] = useState<LotteryCard[]>([]);

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  function startGame() {
    const requested = Number.parseInt(payerCountInput, 10) || 1;
    const payerCount = Math.min(Math.max(requested, 1), poolUids.length);
    const outcomes = shuffledOutcomes(poolUids.length, payerCount);
    setCards(poolUids.map((uid, index) => ({ uid, outcome: outcomes[index], revealed: false })));
    setStep("playing");
  }

  function revealCard(uid: string) {
    setCards((current) =>
      current.map((card) => (card.uid === uid ? { ...card, revealed: true } : card)),
    );
  }

  function revealAll() {
    setCards((current) => current.map((card) => ({ ...card, revealed: true })));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      setCards([]);
    }
    onOpenChange(nextOpen);
  }

  const allRevealed = cards.length > 0 && cards.every((card) => card.revealed);
  const payerUids = cards.filter((card) => card.outcome === "pay").map((card) => card.uid);

  function applyResult() {
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
          <div className="flex flex-col gap-4 py-2">
            <p className="text-muted-foreground text-sm">{t("expenses.lotteryTapHint")}</p>
            <div className="grid grid-cols-3 gap-3">
              {cards.map((card) => (
                <button
                  key={card.uid}
                  type="button"
                  onClick={() => revealCard(card.uid)}
                  disabled={card.revealed}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-all duration-200 active:scale-95",
                    card.revealed
                      ? card.outcome === "pay"
                        ? "border-destructive bg-destructive/10"
                        : "border-border bg-muted"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <span
                    key={card.revealed ? "revealed" : "hidden"}
                    className="animate-in zoom-in-50 fade-in text-3xl duration-300"
                  >
                    {card.revealed ? (card.outcome === "pay" ? "😂" : "🙂") : "❓"}
                  </span>
                  <span className="w-full truncate text-xs font-medium">
                    {members[card.uid].displayName}
                  </span>
                  {card.revealed && (
                    <span className="text-xs font-semibold">
                      {card.outcome === "pay"
                        ? t("expenses.lotteryRevealPay")
                        : t("expenses.lotterySafe")}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {!allRevealed && (
              <Button type="button" variant="outline" onClick={revealAll}>
                {t("expenses.lotteryRevealAll")}
              </Button>
            )}
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
            <div className="flex w-full flex-col gap-2">
              {allRevealed && (
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep("setup")}
                >
                  {t("expenses.lotteryPlayAgain")}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={!allRevealed}
                  onClick={applyResult}
                >
                  {t("expenses.lotteryApply")}
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
