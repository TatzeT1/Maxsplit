"use client";

import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useT } from "@/components/locale-provider";
import { useAppStyle } from "@/lib/app-style";
import { cn } from "@/lib/utils";

/**
 * The groups overview's headline figure, in the active style's own form.
 *
 * Graphit and Original set it as one large figure rising into its line;
 * Fallblatt clatters it onto a split-flap board, Bierdeckel prints it on a
 * beer mat with a tally of your groups, Riso prints it in two colors that
 * slide into register. Renders the `<dt>`/`<dd>` pair, so it sits directly
 * in the totals' `<dl>`; the figure is real text for screen readers in
 * every form (decorative copies are `aria-hidden`).
 */
export function StyleHero({
  label,
  figure,
  dotClassName,
  groupCount,
}: {
  label: string;
  figure: string;
  /** Color class for the direction dot next to the label. */
  dotClassName: string;
  groupCount: number;
}) {
  const style = useAppStyle();

  const dt = (
    <dt className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full bg-current", dotClassName)} />
      <span className="text-muted-foreground">{label}</span>
    </dt>
  );

  if (style === "fallblatt") {
    return (
      <div className="hero-board flex flex-col gap-3">
        <dt className="hero-board-label">{label}</dt>
        <dd>
          <span className="sr-only">{figure}</span>
          <FlapFigure key={figure} text={figure} />
        </dd>
      </div>
    );
  }

  if (style === "bierdeckel") {
    return <Coaster label={label} figure={figure} groupCount={groupCount} />;
  }

  if (style === "riso") {
    return (
      <div className="flex flex-col gap-2">
        {dt}
        <dd className="hero-riso text-[clamp(3.25rem,17vw,5rem)]">
          <span className="hero-riso-pink" aria-hidden="true">
            {figure}
          </span>
          <span className="hero-riso-blue">{figure}</span>
        </dd>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {dt}
      <dd className="overflow-hidden pb-1">
        <span className="display-figure animate-figure-in block text-[clamp(3rem,15vw,4.5rem)]">
          {figure}
        </span>
      </dd>
    </div>
  );
}

const FLAP_DIGITS = "0123456789";

/** One tile per character; digits flip through a few values, then settle. */
function FlapFigure({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  const chars = Array.from(text);
  const lastTick = 6 + chars.length * 2;
  // The tick counts up on an interval; what each tile shows is derived from
  // it during render. A new figure restarts the count (keyed by the parent).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setTick((value) => {
        if (value + 1 >= lastTick) window.clearInterval(timer);
        return value + 1;
      });
    }, 70);
    return () => window.clearInterval(timer);
  }, [reduceMotion, lastTick]);

  const settled = reduceMotion || tick >= lastTick;

  return (
    <span aria-hidden="true" className="flex gap-[3px]">
      {chars.map((target, index) => {
        const kind = /\d/.test(target) ? "digit" : /\s/.test(target) ? "space" : "mark";
        // Each tile settles a little after the one before it.
        const shown =
          kind !== "digit" || settled || tick >= 6 + index * 2
            ? target
            : tick === 0
              ? ""
              : FLAP_DIGITS[(tick * 7 + index * 3) % 10];
        return (
          <span key={`${index}-${shown}`} className="flap" data-kind={kind}>
            {kind === "space" ? "" : shown}
          </span>
        );
      })}
    </span>
  );
}

function Tally({ count }: { count: number }) {
  const strokes: ReactNode[] = [];
  let x = 4;
  for (let i = 0; i < Math.min(count, 15); i++) {
    if (i > 0 && i % 5 === 0) x += 8;
    if (i % 5 === 4) {
      // The fifth stroke crosses the four before it.
      strokes.push(<path key={i} d={`M${x - 27} 17 L${x - 1} 6`} />);
    } else {
      strokes.push(<path key={i} d={`M${x + 0.5} 3 L${x} 21`} />);
      x += 7;
    }
  }
  return (
    <svg width={x + 4} height="24" viewBox={`0 0 ${x + 4} 24`} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none">
        {strokes}
      </g>
    </svg>
  );
}

function Coaster({
  label,
  figure,
  groupCount,
}: {
  label: string;
  figure: string;
  groupCount: number;
}) {
  const t = useT();
  const ringId = useId();
  return (
    <div className="flex justify-center py-2">
      <div className="coaster">
        <svg className="coaster-rim" viewBox="0 0 272 272" aria-hidden="true">
          <defs>
            <path id={ringId} d="M136,136 m-112,0 a112,112 0 1,1 224,0 a112,112 0 1,1 -224,0" />
          </defs>
          <circle cx="136" cy="136" r="128" fill="none" strokeWidth="3" />
          <circle cx="136" cy="136" r="99" fill="none" strokeWidth="1.2" />
          <text className="coaster-rim-text">
            <textPath href={`#${ringId}`}>{t("groups.coasterRim", { count: groupCount })}</textPath>
          </text>
        </svg>
        <div className="coaster-face">
          <dt className="coaster-label">{label}</dt>
          <dd className="display-figure coaster-figure">{figure}</dd>
          <span className="coaster-tally">
            <Tally count={groupCount} />
          </span>
        </div>
      </div>
    </div>
  );
}
