/**
 * The dice and the leather cup, drawn as SVG. One place to swap the drawings
 * for artwork later; the pips are always drawn from the rolled value, so they
 * stay crisp at any size.
 */

const PIPS: Record<number, [number, number][]> = {
  1: [[32, 32]],
  2: [
    [18, 18],
    [46, 46],
  ],
  3: [
    [18, 18],
    [32, 32],
    [46, 46],
  ],
  4: [
    [18, 18],
    [46, 18],
    [18, 46],
    [46, 46],
  ],
  5: [
    [18, 18],
    [46, 18],
    [32, 32],
    [18, 46],
    [46, 46],
  ],
  6: [
    [18, 18],
    [46, 18],
    [18, 32],
    [46, 32],
    [18, 46],
    [46, 46],
  ],
};

/** One die showing `value` (1–6). A lone pip is red, as on a traditional die. */
export function DiceFace({
  value,
  size = 56,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const pips = PIPS[value] ?? [];
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" width={size} height={size} className={className}>
      <rect x={4} y={6} width={56} height={56} rx={13} fill="#000" fillOpacity={0.22} />
      <rect
        x={4}
        y={4}
        width={56}
        height={56}
        rx={13}
        fill="#fffdf7"
        stroke="#3b2417"
        strokeWidth={3}
      />
      <rect
        x={8.5}
        y={8.5}
        width={47}
        height={47}
        rx={9.5}
        fill="none"
        stroke="#fff"
        strokeOpacity={0.9}
        strokeWidth={2}
      />
      {pips.map(([cx, cy], index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={value === 1 ? 7.5 : 5.2}
          fill={value === 1 ? "#e0362c" : "#2a1a12"}
        />
      ))}
    </svg>
  );
}

/** The leather dice cup, mouth up, with a stitched rim. */
export function DiceCupFigure({ size = 120, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      className={className}
    >
      <path d="M24 14 H96 L88 128 Q60 138 32 128 Z" fill="#a8642c" />
      <path d="M24 14 H40 L38 130 Q34 129 32 128 Z" fill="#fff" fillOpacity={0.14} />
      <path d="M96 14 H84 L82 132 Q86 130 88 128 Z" fill="#000" fillOpacity={0.18} />
      <ellipse cx={60} cy={14} rx={36} ry={9} fill="#6d3a12" />
      <ellipse cx={60} cy={14} rx={30} ry={6} fill="#2a1a12" />
      <path
        d="M30 36 H90"
        stroke="#f6d9a8"
        strokeWidth={2.4}
        strokeDasharray="5 5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M33 116 H87"
        stroke="#f6d9a8"
        strokeWidth={2.4}
        strokeDasharray="5 5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
