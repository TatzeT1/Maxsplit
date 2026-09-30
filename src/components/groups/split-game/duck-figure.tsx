/**
 * A rubber duck seen from above, swimming "down" the page (head at the
 * bottom). One place to swap the drawing for artwork later. `color` is the
 * swim cap — the person's own colour; the initial shows on its back when the
 * duck is big enough to read it.
 */
export function DuckFigure({
  color,
  initial,
  size,
  className,
}: {
  color: string;
  initial: string;
  /** Width in px; the height follows the drawing's 48:60 proportions. */
  size: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 60"
      width={size}
      height={(size * 60) / 48}
      className={className}
    >
      {/* tail tuft */}
      <path d="M24 0 L29 9 L19 9 Z" fill="#f2b705" />
      {/* body and wings */}
      <ellipse cx={24} cy={25} rx={17} ry={20} fill="#ffd93b" />
      <ellipse cx={24} cy={29} rx={17} ry={16} fill="#f2b705" fillOpacity={0.35} />
      <ellipse cx={9.5} cy={26} rx={5} ry={10} fill="#f2b705" />
      <ellipse cx={38.5} cy={26} rx={5} ry={10} fill="#f2b705" />
      {/* head, beak, cap, eyes */}
      <circle cx={24} cy={43} r={10.5} fill="#ffd93b" />
      <path d="M17.5 53 Q24 62 30.5 53 Q24 56 17.5 53 Z" fill="#ff8a1f" />
      <path d="M13.5 43 A10.5 10.5 0 0 1 34.5 43 Z" fill={color} />
      <circle cx={19} cy={47.5} r={1.9} fill="#3b2417" />
      <circle cx={29} cy={47.5} r={1.9} fill="#3b2417" />
      {size >= 30 && (
        <text
          x={24}
          y={26}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={15}
          fontWeight={800}
          fill="#fff"
          stroke="#3b2417"
          strokeOpacity={0.55}
          strokeWidth={2.4}
          paintOrder="stroke"
        >
          {initial}
        </text>
      )}
    </svg>
  );
}
