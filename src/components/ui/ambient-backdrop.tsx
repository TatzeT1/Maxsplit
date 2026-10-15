import { cn } from "@/lib/utils";

/**
 * The page's ground, fixed behind the content.
 *
 * Every layer is always rendered and the active style decides in CSS which
 * ones show (globals.css, "Backdrop"): Graphit uses only the soft top light
 * and grain, Original adds its warm/teal wash and the paper dot-grid, the
 * other styles bring their own texture (wood grain, halftone dots, …). It is
 * `fixed` rather than `absolute` so the ground stays put while content
 * scrolls over it.
 */
export function AmbientBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none fixed inset-0 -z-10", className)}>
      <div className="backdrop-light absolute inset-0" />
      <div className="backdrop-texture absolute inset-0" />
      <div className="bg-grain absolute inset-0" />
    </div>
  );
}
