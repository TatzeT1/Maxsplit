import { cn } from "@/lib/utils";

/**
 * Shared "N of target decided" pip row — a filled, ringed pip per revealed
 * loser, a dashed empty slot per draw still pending. Used by the wheel,
 * slot machine and scratch cards so a round's progress always reads the
 * same way regardless of which game is being played.
 */
export function GameProgressPips({
  revealedCount,
  target,
  progressLabel,
}: {
  revealedCount: number;
  target: number;
  progressLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <span className="sr-only">{progressLabel}</span>
      {Array.from({ length: target }, (_, index) => {
        const found = index < revealedCount;
        return (
          <span
            key={index}
            aria-hidden="true"
            className={cn(
              "relative flex size-7 items-center justify-center rounded-lg border transition-colors duration-(--duration-base)",
              found ? "border-destructive/40 bg-destructive/10" : "border-border border-dashed",
            )}
          >
            {found ? (
              <span className="animate-settle-ring border-destructive/40 pointer-events-none absolute inset-0 rounded-lg border" />
            ) : (
              <span className="bg-muted-foreground/25 size-1.5 rounded-full" />
            )}
          </span>
        );
      })}
    </div>
  );
}
