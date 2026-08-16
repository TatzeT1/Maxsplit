import { AnimatedMoney } from "@/components/ui/animated-money";

/**
 * The orchestrated "it landed" moment, shared by anything that saves money
 * moving between people — a settlement recorded, an expense saved.
 *
 * Ten falling confetti particles and a party-popper glyph used to live here.
 * They were replaced rather than removed, because the beat itself is right —
 * money moving is the payoff the whole screen exists for and deserves to be
 * marked. What changed is the register. Confetti is a birthday; this is a
 * receipt being stamped, and the second one is what this app is about.
 *
 * Four things run on one shared clock, in sequence rather than at once:
 * a glow blooms out from behind the disc, a single hairline ring expands and
 * fades, the checkmark draws itself stroke-first the way a pen would, and the
 * amount counts up. Sequencing is the whole trick — the same four effects fired
 * simultaneously read as a burst of noise, while staged over ~700ms they read
 * as one deliberate gesture with a beginning and an end.
 *
 * The checkmark's `pathLength="1"` normalises the stroke to a length of 1
 * regardless of the path's real geometry, so the dash offset that draws it does
 * not have to be recomputed if the path is ever edited.
 */
export function SaveCelebration({
  label,
  amountMinor,
  currency,
}: {
  label: string;
  amountMinor: number;
  currency: string;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="relative flex size-20 items-center justify-center">
        <span
          className="bg-success/25 animate-bloom absolute inset-0 rounded-full blur-xl"
          aria-hidden="true"
        />
        <span
          className="border-success/50 animate-settle-ring absolute inset-0 rounded-full border"
          aria-hidden="true"
          style={{ animationDelay: "120ms" }}
        />
        <span className="bg-success text-success-foreground shadow-e2 animate-rise relative flex size-16 items-center justify-center rounded-full">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-7"
            aria-hidden="true"
          >
            <path
              d="M5 13l4 4L19 7"
              pathLength={1}
              className="animate-draw-stroke [--stroke-length:1]"
              style={{ animationDelay: "180ms" }}
            />
          </svg>
        </span>
      </div>
      <p className="font-heading animate-rise text-center text-lg font-medium [--stagger:6]">
        {label} <AnimatedMoney amountMinor={amountMinor} currency={currency} countOnMount />
      </p>
    </div>
  );
}
