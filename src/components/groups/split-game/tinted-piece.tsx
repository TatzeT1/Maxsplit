import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A glossy game piece in a player's color. The artwork (`public/duel/*.webp`)
 * is a grey luminance map whose body sits at 50% grey, so hard-light blending
 * it over a flat fill leaves the player's color untouched there and only adds
 * the highlights and shading — one image serves every member's palette color.
 *
 * Grids `preload` their piece images: pieces only appear on a tap, and the
 * first of each kind would otherwise flash in empty while its image loads.
 */
export function TintedPiece({
  src,
  color,
  className,
  children,
}: {
  src: string;
  color: string;
  className?: string;
  children?: ReactNode;
}) {
  const image = `url(${src})`;
  return (
    <span className={cn("relative isolate flex items-center justify-center", className)}>
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundColor: color,
          maskImage: image,
          WebkitMaskImage: image,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-contain bg-center bg-no-repeat mix-blend-hard-light"
        style={{ backgroundImage: image }}
      />
      {children !== undefined && <span className="relative">{children}</span>}
    </span>
  );
}
