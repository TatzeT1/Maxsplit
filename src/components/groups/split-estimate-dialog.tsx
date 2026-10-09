"use client";

import type { FunctionComponent } from "react";
import type { GameStake } from "@/lib/games/payers";
import type { GameExpenseDraft, GroupMember } from "@/lib/types";

export interface SplitEstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  /** Required: both places to play (one phone, online) talk to the server, and the setup is remembered per group. */
  groupId: string;
  /** The bill being played for — each payer's share goes on their slip and in the verdict. Display only. */
  stake?: GameStake | null;
  /**
   * Who pays, and everyone who played (stored on the expense). `meta` carries
   * the round that decided it, so the expense can claim it (`claimRoundId`).
   */
  onResolve: (
    loserUids: string[],
    playerUids: string[],
    meta?: { estimateRoundId: string },
  ) => void;
  /**
   * The bill an online round books by itself once it is decided.
   * `undefined` = this form can't (editing an expense): online isn't offered.
   * `null` = it could, but the form isn't complete yet.
   */
  expenseDraft?: GameExpenseDraft | null;
  /** An online round started — the caller closes the form and opens its page. */
  onRoundStarted?: (roundId: string) => void;
}

/**
 * Schätzfragen: one question, one number, everyone guesses in secret — on one
 * phone or online. FOUNDATION STUB: the final export name and props, so the
 * catalog, the loader and the lazy dialog compile and every later package
 * builds against them; the real dialog (SPEC G.2–G.6) replaces this body.
 * It renders nothing and is not mounted in the add-expense form yet.
 */
export const SplitEstimateDialog: FunctionComponent<SplitEstimateDialogProps> = () => null;
