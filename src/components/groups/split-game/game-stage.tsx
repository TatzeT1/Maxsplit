"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { RotateCcw, Volume2, VolumeX, XIcon } from "lucide-react";
import Link from "next/link";
import { useGameRound } from "@/components/groups/split-game/game-round";
import { useT } from "@/components/locale-provider";
import { useGameSoundsMuted } from "@/lib/sound/use-game-sounds-muted";
import { cn } from "@/lib/utils";

/**
 * The full-screen stage every split game plays on. Games used to open in the
 * app's ordinary centered dialog — a small card over a dimmed group page,
 * which felt like a tab inside the app rather than being *in* the game. The
 * stage takes the whole screen instead: no app chrome, just the game's own
 * title bar with a ✕, the board in the middle and the actions at the bottom.
 *
 * Layout, top to bottom, inside a frame pinned to the viewport:
 *
 * - The children's `DialogHeader` sticks to the top under the notch.
 * - Everything between header and footer is centered vertically in the
 *   leftover height (auto margins on the header and footer), so a small board
 *   doesn't hang off the top of a tall phone.
 * - The children's `DialogFooter` sticks to the bottom above the home
 *   indicator, so "Los geht's" / "Übernehmen" never scroll out of reach.
 *
 * The frame is a fixed `inset-0` box with its own scroller, never padding on
 * the document (see AGENTS.md, "Mobile is the primary surface"). Content is
 * capped at `max-w-2xl` and centered, so a desktop screen gets the same stage
 * with the board at a sensible size instead of a 27" memory grid.
 *
 * Boards size themselves off `--game-board-h`, the height left for the board
 * once the stage's own chrome is subtracted. A board of aspect ratio `r`
 * (width / height) caps its width at `min(<its cap>, var(--game-board-h) * r)`
 * — width-bound on a phone, height-bound on a short or wide window. Outside
 * the stage the variable is unset and every board falls back to its old
 * pixel size.
 */
/**
 * Roughly what the stage's chrome takes up in height on a phone: title bar,
 * a ladder strip or progress pips, a turn banner, and the sticky footer, plus
 * the safe areas. Whatever is left is the board's height budget.
 */
const STAGE_CHROME_PX = 320;

const STAGE_FRAME =
  "bg-background text-foreground fixed inset-0 z-50 flex flex-col outline-none [--game-board-h:calc(100dvh_-_320px)]";

const STAGE_COLUMN = cn(
  // Children never shrink: the column grows and the frame scrolls instead.
  "mx-auto flex min-h-full w-full max-w-2xl min-w-0 flex-col gap-4 px-4 text-sm [&>*]:shrink-0",
  // Header first, then the stage's own "n. Versuch" line, then the game's body.
  "[&>[data-slot=dialog-header]]:-order-2",
  // Header: sticky under the notch, room on the right for 🔊 and ✕.
  "[&>[data-slot=dialog-header]]:bg-background/85 [&>[data-slot=dialog-header]]:sticky [&>[data-slot=dialog-header]]:top-0 [&>[data-slot=dialog-header]]:z-10 [&>[data-slot=dialog-header]]:-mx-4 [&>[data-slot=dialog-header]]:px-4 [&>[data-slot=dialog-header]]:pt-[calc(env(safe-area-inset-top)_+_0.875rem)] [&>[data-slot=dialog-header]]:pr-26 [&>[data-slot=dialog-header]]:pb-3 [&>[data-slot=dialog-header]]:backdrop-blur-md",
  // With a footer, auto margins on both center the body between them; without
  // one (the page stage) the body simply follows the header.
  "[&:has(>[data-slot=dialog-footer])>[data-slot=dialog-header]]:mb-auto",
  // Title a notch bigger than in a dialog: it's the screen's heading now.
  "[&>[data-slot=dialog-header]_[data-slot=dialog-title]]:text-lg [&>[data-slot=dialog-header]_[data-slot=dialog-title]]:font-semibold",
  // Footer: sticky above the home indicator, square instead of a card's foot.
  "[&>[data-slot=dialog-footer]]:bg-background/85 [&>[data-slot=dialog-footer]]:sticky [&>[data-slot=dialog-footer]]:bottom-0 [&>[data-slot=dialog-footer]]:z-10 [&>[data-slot=dialog-footer]]:mt-auto [&>[data-slot=dialog-footer]]:mb-0 [&>[data-slot=dialog-footer]]:-mx-4 [&>[data-slot=dialog-footer]]:rounded-none [&>[data-slot=dialog-footer]]:pb-[calc(env(safe-area-inset-bottom)_+_1rem)] [&>[data-slot=dialog-footer]]:backdrop-blur-md",
  // Stacked on a phone, the footer's `flex-1` buttons would get a 0 height
  // basis in the column and collapse to a sliver; size them by content there.
  "max-sm:[&>[data-slot=dialog-footer]>*]:basis-auto",
  // A stage without a footer still needs to clear the home indicator.
  "pb-[env(safe-area-inset-bottom)] has-[>[data-slot=dialog-footer]]:pb-0",
);

const CORNER_BUTTON =
  "hover:bg-accent focus-visible:ring-ring/50 absolute top-[calc(env(safe-area-inset-top)_+_0.5rem)] z-20 flex size-11 items-center justify-center rounded-full transition-[background-color,transform] duration-(--duration-fast) outline-none focus-visible:ring-3 active:scale-95";

const CLOSE_BUTTON = cn(CORNER_BUTTON, "right-2");

/**
 * Sound on/off for every game, next to the ✕. One setting for all games on
 * this device — at a restaurant table you switch it off once, not per game.
 */
function GameSoundToggle() {
  const t = useT();
  const [muted, setMuted] = useGameSoundsMuted();
  return (
    <button
      type="button"
      aria-pressed={!muted}
      aria-label={t("expenses.gameSoundToggle")}
      onClick={() => setMuted(!muted)}
      className={cn(CORNER_BUTTON, "right-13", muted && "text-muted-foreground")}
    >
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
    </button>
  );
}

/**
 * "3. Versuch" under the title once the expense form has started more than
 * one round — so everyone at the table sees that this is a reshuffle, and
 * knows the expense will say so too (see `game-round.tsx`).
 */
function GameRoundNotice() {
  const t = useT();
  const { round } = useGameRound();
  if (round < 2) return null;
  return (
    <p
      data-slot="game-round"
      className="bg-muted text-muted-foreground -order-1 flex items-center justify-center gap-1.5 self-center rounded-full px-3 py-1 text-xs"
    >
      <RotateCcw aria-hidden="true" className="size-3.5" />
      {t("expenses.gameRoundNotice", { count: round })}
    </p>
  );
}

/**
 * Drop-in replacement for `DialogContent` in a game dialog: same Radix
 * dialog (focus trap, Escape, `onOpenChange`), rendered as a full-screen
 * stage. Children are the usual `DialogHeader` / body / `DialogFooter`.
 * `frameClassName` dresses the whole frame, e.g. the slot machine's dark
 * casino backdrop while the reels are in play. `soundToggle={false}` drops
 * the 🔊 corner switch for a game that has its own (the slot machine's deck).
 */
export function GameDialogContent({
  className,
  frameClassName,
  soundToggle = true,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  frameClassName?: string;
  soundToggle?: boolean;
}) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          STAGE_FRAME,
          frameClassName,
          "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-6 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-6 duration-(--duration-base) ease-(--ease-entrance) data-closed:duration-(--duration-fast)",
        )}
        {...props}
      >
        <div
          data-slot="stage-scroller"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          <div className={cn(STAGE_COLUMN, className)}>
            {children}
            <GameRoundNotice />
          </div>
        </div>
        {soundToggle && <GameSoundToggle />}
        <DialogPrimitive.Close className={CLOSE_BUTTON}>
          <XIcon className="size-5" />
          <span className="sr-only">{t("common.close")}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * The same stage for a game that is a page rather than a dialog — the online
 * match / tournament page. It lays itself over the app's sidebar and mobile
 * header (both live in the `(app)` layout this page renders inside), and its
 * ✕ is a link back to `closeHref`.
 */
export function GamePageStage({
  closeHref,
  title,
  children,
}: {
  closeHref: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className={cn(STAGE_FRAME, "z-40")}>
      <div
        data-slot="stage-scroller"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div className={STAGE_COLUMN}>
          <div data-slot="dialog-header" className="flex flex-col gap-2">
            {title}
          </div>
          {children}
        </div>
      </div>
      <GameSoundToggle />
      <Link href={closeHref} aria-label={t("common.close")} className={CLOSE_BUTTON}>
        <XIcon className="size-5" />
      </Link>
    </div>
  );
}

/**
 * Scales a fixed-pixel game figure (the wheel, the balloon) up to the room
 * the stage has — a CSS transform, so the figure's own pixel geometry stays
 * untouched. Never shrinks below its designed size (it was designed to fit a
 * small phone), and stops at `maxScale` so a desktop doesn't get a
 * dinner-plate wheel. The wrapper reserves the scaled height, so the layout
 * around it moves with it.
 */
export function StageScale({
  width,
  height,
  maxScale = 1.6,
  className,
  children,
}: {
  width: number;
  height: number;
  maxScale?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    function measure() {
      if (!element) return;
      const roomWide = element.clientWidth / width;
      const roomHigh = (window.innerHeight - STAGE_CHROME_PX) / height;
      const next = Math.min(maxScale, Math.max(1, Math.min(roomWide, roomHigh)));
      setScale(Math.round(next * 100) / 100);
    }
    measure();
    // The wrapper's width comes from its parent, never from the scaled child
    // (whose box is fixed), so observing it can't feed back on itself.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [width, height, maxScale]);

  return (
    <div
      ref={ref}
      className={cn("flex w-full justify-center", className)}
      style={{ height: height * scale }}
    >
      <div
        className="relative shrink-0"
        style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top center" }}
      >
        {children}
      </div>
    </div>
  );
}
