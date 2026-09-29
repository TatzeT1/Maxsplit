"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/** Error correction M, the level the EPC prescribes for GiroCodes, and the four-module quiet zone scanners need. */
function encodeQr(value: string) {
  return encode(value, { ecc: "M", border: 4 });
}

/**
 * A QR code as crisp SVG: one path of unit squares for the dark modules, on a
 * white square that includes the quiet zone.
 * Always black on white — deliberately not theme tokens: a scanner reads it,
 * not a person, and many can't read an inverted code off a dark screen.
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
    const qr = encodeQr(value);
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

const IMAGE_WIDTH_PX = 720;
const CAPTION_LINE_PX = 40;
const CAPTION_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Shortens a caption line with "…" until it fits — by code point, so an emoji is never cut in half. */
function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && context.measureText(`${chars.join("")}…`).width > maxWidth) {
    chars.pop();
  }
  return `${chars.join("").trimEnd()}…`;
}

/**
 * The same code as a PNG file, about 720px wide, with caption lines under it
 * (the first one bold) — so it's recognizable among a phone's photos, where
 * a banking app that imports codes from pictures looks for it.
 *
 * Deliberately synchronous (toDataURL, not toBlob): a click handler can pass
 * the file straight to navigator.share, and iOS refuses a share that no
 * longer runs inside the tap that asked for it.
 */
export function qrCodePngFile(value: string, caption: string[], fileName: string): File {
  const qr = encodeQr(value);
  const scale = Math.max(8, Math.floor(IMAGE_WIDTH_PX / qr.size));
  const width = qr.size * scale;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  // The caption starts below the quiet zone, never inside it.
  canvas.height = width + (caption.length > 0 ? caption.length * CAPTION_LINE_PX + 2 * scale : 0);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas to draw the QR code on");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  qr.data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect(x * scale, y * scale, scale, scale);
    }),
  );

  context.textAlign = "center";
  context.textBaseline = "middle";
  caption.forEach((line, index) => {
    context.font = index === 0 ? `600 28px ${CAPTION_FONT}` : `24px ${CAPTION_FONT}`;
    context.fillStyle = index === 0 ? "#000" : "#555";
    const y = width + index * CAPTION_LINE_PX + CAPTION_LINE_PX / 2;
    context.fillText(fitText(context, line, width - 8 * scale), width / 2, y);
  });

  const base64 = canvas.toDataURL("image/png").split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], fileName, { type: "image/png" });
}
