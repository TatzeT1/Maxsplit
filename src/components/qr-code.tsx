"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code as crisp SVG: one path of unit squares for the dark modules, on a
 * white square that includes the four-module quiet zone scanners need.
 * Always black on white — deliberately not theme tokens: a scanner reads it,
 * not a person, and many can't read an inverted code off a dark screen.
 * Error correction M, the level the EPC prescribes for GiroCodes.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  /** What the code contains, for screen readers — the modules themselves say nothing. */
  label: string;
  className?: string;
}) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 4 });
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, size: qr.size };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
