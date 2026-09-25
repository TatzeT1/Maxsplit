import { DialogDescription } from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import type { GroupMember } from "@/lib/types";

/**
 * Shared "X pays" verdict banner, shown once a mini-game's round is fully
 * resolved — identical markup across the wheel, slot machine, scratch cards
 * and the original lottery, so a round always lands the same way regardless
 * of which game produced it.
 */
export function GameResultBanner({
  loserUids,
  members,
}: {
  loserUids: string[];
  members: Record<string, GroupMember>;
}) {
  const t = useT();
  const loserNames = loserUids.map((uid) => members[uid].displayName);
  const resultText =
    loserNames.length === 1
      ? t("expenses.gameResultOne", { name: loserNames[0] })
      : t("expenses.gameResultMultiple", { names: loserNames.join(", ") });

  return (
    <div className="border-primary/30 bg-primary/5 animate-rise relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border p-4 text-center">
      {/* Visible text alone doesn't get announced on arrival — this is the state change screen readers actually hear. */}
      <p aria-live="polite" className="sr-only">
        {resultText}
      </p>
      <span
        aria-hidden="true"
        className="bg-primary/25 animate-bloom pointer-events-none absolute -top-10 left-1/2 size-28 -translate-x-1/2 rounded-full blur-2xl"
      />
      <span className="text-muted-foreground relative text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t("expenses.gameResultEyebrow")}
      </span>
      <div className="relative flex -space-x-2">
        {loserNames.map((name, index) => (
          <GameAvatar
            key={loserUids[index]}
            name={name}
            className="ring-popover size-10 text-sm ring-2"
          />
        ))}
      </div>
      <DialogDescription className="font-heading text-foreground relative text-lg font-medium">
        {resultText}
      </DialogDescription>
    </div>
  );
}
