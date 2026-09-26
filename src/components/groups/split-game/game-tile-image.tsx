import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A game's cartoon tile illustration (`public/game-tiles/*.jpg`), framed as a
 * rounded sticker with a small circular emoji badge overlapping its corner —
 * the badge keeps the familiar emoji recognizable while the illustration
 * carries the personality, the same "small chip over a bigger visual"
 * language `GameAvatar`'s tapper badge already uses on the lottery board.
 */
export function GameTileImage({
  src,
  emoji,
  size = "sm",
  className,
}: {
  src: string;
  emoji: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0",
        size === "lg" ? "size-32" : "size-16",
        className,
      )}
    >
      <span className="ring-foreground/10 shadow-e1 bg-card relative block size-full overflow-hidden rounded-2xl ring-1">
        <Image
          src={src}
          alt=""
          fill
          sizes={size === "lg" ? "128px" : "64px"}
          className="object-cover"
        />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "bg-card ring-popover shadow-e1 absolute flex items-center justify-center rounded-full ring-2",
          size === "lg"
            ? "-right-2 -bottom-2 size-11 text-xl"
            : "-right-1.5 -bottom-1.5 size-6 text-xs",
        )}
      >
        {emoji}
      </span>
    </span>
  );
}
