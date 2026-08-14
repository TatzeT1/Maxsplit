import { cn } from "@/lib/utils";

/**
 * The page's ground: a fixed gradient wash, the paper dot-grid, and film grain.
 *
 * This replaces the drifting blurred colour blobs that used to sit behind every
 * screen. Three reasons they had to go:
 *
 * 1. They are the most recognisable stock background of the last few years, so
 *    they actively work against the app looking like anything in particular.
 * 2. They moved forever. Ambient motion that never resolves competes with the
 *    motion that carries meaning — a balance updating, a row arriving — and the
 *    guidance is explicit that a view should animate one or two things, not
 *    everything at once.
 * 3. Large animated `blur-3xl` layers are genuinely expensive to composite on a
 *    phone, which is the primary surface here.
 *
 * What replaces them is static and does the same job better. The wash is an
 * off-axis radial pair in the palette's own warm/teal pairing, held at low
 * opacity so it reads as light falling across paper rather than as two coloured
 * circles. The grain on top is what makes it read as a material at all: without
 * it the gradient is visibly a gradient; with it the eye reads texture and
 * stops looking. It is `fixed` rather than `absolute` so the ground stays put
 * while content scrolls over it, the way a surface would.
 */
export function AmbientBackdrop({
  className,
  tint,
}: {
  className?: string;
  /** Optional `from-*`/`to-*` gradient pair, to key a screen to its subject. */
  tint?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none fixed inset-0 -z-10", className)}>
      <div className="bg-paper-texture absolute inset-0 opacity-[0.25]" />
      {tint ? (
        <div className={cn("absolute inset-0 bg-linear-to-br opacity-[0.07]", tint)} />
      ) : (
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(70rem 40rem at 88% -10%, color-mix(in oklch, var(--primary), transparent 88%), transparent 60%), radial-gradient(60rem 38rem at -10% 45%, color-mix(in oklch, var(--accent), transparent 82%), transparent 62%)",
          }}
        />
      )}
      <div className="bg-grain absolute inset-0" />
    </div>
  );
}
