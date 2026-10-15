import type { CSSProperties } from "react";
import { memberPalette } from "@/lib/games/member-colors";
import { cn } from "@/lib/utils";

/**
 * A person's or group's color pair as CSS variables for a `.monogram` tile.
 * Most styles ignore them and draw a quiet ink tile; the Original style
 * paints the tile with them as a gradient, the way avatars used to look.
 */
export function monogramVars(seed: string): CSSProperties {
  const [from, to] = memberPalette(seed);
  return { "--mono-from": from, "--mono-to": to } as CSSProperties;
}

/**
 * A person's initial on a `.monogram` tile — the everyday-UI avatar. Sized by
 * the caller (`size-*`, `text-*`). The split games use `GameAvatar` instead,
 * whose per-person color is how players tell each other apart on a board.
 */
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={monogramVars(name)}
      className={cn(
        "monogram flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}
