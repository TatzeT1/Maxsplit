import { cn } from "@/lib/utils";

/**
 * The page's ground: plain background, one soft fall of light from the top,
 * and film grain.
 *
 * It used to carry a colored wash (primary + accent radials, or a per-group
 * gradient tint) and a dot-grid on top. Together with gradient avatars and
 * per-category colors that made every screen several hues at once. The ground
 * is now neutral: the light is the foreground ink at a few percent, so it
 * reads as depth rather than color, and the grain keeps the large flat areas
 * from looking like a painted rectangle. It is `fixed` rather than `absolute`
 * so the ground stays put while content scrolls over it.
 */
export function AmbientBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none fixed inset-0 -z-10", className)}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(48rem 26rem at 50% -8rem, color-mix(in oklch, var(--foreground), transparent 94%), transparent 70%)",
        }}
      />
      <div className="bg-grain absolute inset-0" />
    </div>
  );
}
