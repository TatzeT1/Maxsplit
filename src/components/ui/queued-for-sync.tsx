import { CloudOff } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-money";

/**
 * Shown instead of `SaveCelebration` when an add-expense/record-settlement
 * submit couldn't reach the server and was queued for later (see
 * lib/offline/action-queue.ts). Deliberately a different mark — a hollow
 * cloud rather than the filled checkmark disc — so "saved, but not yet for
 * real" never reads as identical to "saved." Conflating the two is exactly
 * the failure mode AGENTS.md warns about for loading vs. error states,
 * generalised to pending vs. confirmed.
 */
export function QueuedForSync({
  label,
  caption,
  amountMinor,
  currency,
}: {
  label: string;
  caption: string;
  amountMinor: number;
  currency: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10">
      <div className="bg-muted text-muted-foreground animate-rise flex size-16 items-center justify-center rounded-full">
        <CloudOff className="size-7" aria-hidden="true" />
      </div>
      <p className="font-heading animate-rise text-center text-lg font-medium [--stagger:6]">
        {label} <AnimatedMoney amountMinor={amountMinor} currency={currency} countOnMount />
      </p>
      <p className="text-muted-foreground animate-rise text-center text-sm [--stagger:9]">
        {caption}
      </p>
    </div>
  );
}
