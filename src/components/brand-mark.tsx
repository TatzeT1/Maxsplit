import { cn } from "@/lib/utils";

/**
 * Split's mark, the app icon's coin broken in two along a stepped seam, drawn
 * small enough for a header. Ink tile, page-colored coin: the mark stays
 * monochrome like the icon on the home screen, so the accent is left for the
 * one action on each screen.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-foreground flex size-7 shrink-0 items-center justify-center rounded-[0.55rem]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="fill-background size-[78%]">
        <path d="M11 4.57A7.5 7.5 0 0 0 10.6 19.37V12.4L11 11.8Z" />
        <path d="M12.9 4.55A7.5 7.5 0 0 1 12.4 19.49V12.2L12.9 11.6Z" />
      </svg>
    </span>
  );
}
