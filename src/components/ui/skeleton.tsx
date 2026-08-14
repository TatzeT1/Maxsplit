import { cn } from "@/lib/utils";

/**
 * A loading placeholder that sweeps rather than blinks.
 *
 * `animate-pulse` fades the whole block in and out, which reads as an element
 * flashing at you and gives no sense of direction. A sheen travelling across
 * the surface reads as something being revealed, and — because the sweep is
 * continuous and always moves the same way — a column of skeletons scans as
 * one loading region instead of several unrelated blinking rectangles.
 *
 * `aria-busy` and the `status` role mean the wait is announced rather than
 * being a silent gap for anyone using a screen reader. Note that a skeleton
 * says "loading", never "failed" — a listener error has to render its own
 * visible error state, or the two become indistinguishable (see AGENTS.md).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      role="status"
      aria-busy="true"
      className={cn(
        "bg-muted animate-shimmer rounded-md bg-linear-to-r from-transparent via-[color-mix(in_oklch,var(--foreground),transparent_92%)] to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
