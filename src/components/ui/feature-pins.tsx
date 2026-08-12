"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { FileDown, Heart, Scale, Split, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS = { invite: UserPlus, split: Split, balance: Scale, pdf: FileDown, free: Heart };

export type FeatureIconName = keyof typeof ICONS;

const Pin = ({ className }: Readonly<{ className?: string }>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M16 3a1 1 0 0 1 .117 1.993l-.117 .007v4.764l1.894 3.789a1 1 0 0 1 .1 .331l.006 .116v2a1 1 0 0 1 -.883 .993l-.117 .007h-4v4a1 1 0 0 1 -1.993 .117l-.007 -.117v-4h-4a1 1 0 0 1 -.993 -.883l-.007 -.117v-2a1 1 0 0 1 .06 -.34l.046 -.107l1.894 -3.791v-4.762a1 1 0 0 1 -.117 -1.993l.117 -.007h8z" />
  </svg>
);

type ColorTheme = "orange" | "teal" | "rose";

const badgeBg: Record<ColorTheme, string> = {
  orange: "bg-orange-50 dark:bg-orange-500/10",
  teal: "bg-teal-50 dark:bg-teal-500/10",
  rose: "bg-rose-50 dark:bg-rose-500/10",
};
const badgeText: Record<ColorTheme, string> = {
  orange: "text-orange-600 dark:text-orange-400",
  teal: "text-teal-600 dark:text-teal-400",
  rose: "text-rose-600 dark:text-rose-400",
};
const badgeBorder: Record<ColorTheme, string> = {
  orange: "border-orange-100 dark:border-orange-500/20",
  teal: "border-teal-100 dark:border-teal-500/20",
  rose: "border-rose-100 dark:border-rose-500/20",
};

export interface FeaturePin {
  title: string;
  description: string;
  icon: FeatureIconName;
  colorTheme?: ColorTheme;
}

interface CardPosition {
  className?: string;
  rotate?: string;
}

function FeatureCard({
  feature,
  position,
}: Readonly<{ feature: FeaturePin; position: CardPosition }>) {
  const theme = feature.colorTheme ?? "orange";
  const Icon = ICONS[feature.icon];

  return (
    <div
      className={cn(
        "relative w-full transition-transform duration-300 hover:z-30 hover:scale-105 md:w-[270px]",
        position.rotate,
        position.className,
      )}
    >
      <div className="bg-card border-border/60 rounded-3xl border p-2 shadow-lg shadow-black/5 dark:shadow-black/20">
        <Pin className="text-muted-foreground/40 mx-auto mb-4 size-5" />
        <div
          className={cn(
            "flex h-full flex-col rounded-2xl border p-4",
            badgeBg[theme],
            badgeBorder[theme],
          )}
        >
          <span
            className={cn(
              "mb-4 flex size-11 items-center justify-center rounded-full",
              badgeBg[theme],
              badgeText[theme],
            )}
          >
            <Icon className="size-5" />
          </span>
          <h3 className="font-heading text-foreground mb-1.5 text-lg leading-tight font-semibold">
            {feature.title}
          </h3>
          <p className="text-muted-foreground text-sm/5 tracking-tight">{feature.description}</p>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_POSITIONS: CardPosition[] = [
  { className: "md:absolute md:top-0 md:left-[15%]", rotate: "rotate-6" },
  { className: "md:absolute md:top-[130px] md:right-[15%]", rotate: "-rotate-6" },
  { className: "md:absolute md:top-[460px] md:left-[15%]", rotate: "rotate-6" },
  { className: "md:absolute md:top-[580px] md:right-[10%]", rotate: "-rotate-6" },
  { className: "md:absolute md:top-[860px] md:left-[15%]", rotate: "rotate-6" },
];

const PATH_SEGMENTS = [
  "M 290 150 C 500 150, 550 270, 710 270",
  "C 850 270, 500 350, 290 450",
  "C 290 600, 550 720, 750 720",
  "C 950 720, 500 800, 290 850",
];

export interface FeaturePinsProps {
  features: FeaturePin[];
  className?: string;
}

export function FeaturePins({ features, className }: Readonly<FeaturePinsProps>) {
  const reduce = useReducedMotion();
  const positions = DEFAULT_POSITIONS;

  let height = 1140;
  if (features.length <= 1) height = 400;
  else if (features.length === 2) height = 460;
  else if (features.length === 3) height = 800;
  else if (features.length === 4) height = 920;

  const pathD = PATH_SEGMENTS.slice(0, Math.max(features.length - 1, 0)).reduce(
    (acc, segment, index) => (index === 0 ? segment : `${acc} ${segment}`),
    "",
  );

  return (
    <div className={cn("relative w-full", className)}>
      <div
        className="relative mx-auto flex h-auto w-full max-w-[1000px] flex-col space-y-8 md:block md:h-[var(--md-height)] md:space-y-0"
        style={{ "--md-height": `${height}px` } as React.CSSProperties}
      >
        {features.length > 1 && (
          <svg
            className="pointer-events-none absolute top-0 left-0 z-0 hidden h-full w-full md:block"
            viewBox={`0 0 1000 ${height}`}
            preserveAspectRatio="none"
          >
            <motion.path
              d={pathD}
              stroke="currentColor"
              className="text-border"
              strokeWidth="2"
              strokeDasharray="8 6"
              fill="none"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ strokeDashoffset: 0 }}
              animate={reduce ? undefined : { strokeDashoffset: -140 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </svg>
        )}

        {features.map((feature, index) => (
          <FeatureCard
            key={feature.title}
            feature={feature}
            position={positions[index % positions.length]}
          />
        ))}
      </div>
    </div>
  );
}

export default FeaturePins;
