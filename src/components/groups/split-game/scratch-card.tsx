"use client";

import { Eye } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";
import { useT } from "@/components/locale-provider";
import { cn, nameHash } from "@/lib/utils";
import { memberPalette } from "@/lib/games/member-colors";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { ConfettiBurst, InkStamp } from "@/components/groups/split-game/celebration";

/** Fraction of the foil that has to be scratched away before the rest auto-clears. */
const REVEAL_THRESHOLD = 0.45;
/** Scratch brush radius, in CSS pixels. */
const BRUSH_RADIUS = 18;
/** The foil's own two tones, reused for the flakes it sheds when it comes off. */
const FOIL_LIGHT = "#cbd5e1";
const FOIL_DARK = "#94a3b8";

function paintFoil(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, FOIL_LIGHT);
  gradient.addColorStop(1, FOIL_DARK);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  for (let x = -height; x < width; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
}

/**
 * One scratch-off card. The prize underneath (`isLoser`) is fixed by the
 * caller before any scratching happens — the canvas is purely a foil layer
 * being erased, it never decides the outcome. Erasing enough of it (by drag
 * or, for keyboard/a11y, the explicit reveal button) auto-clears the rest.
 *
 * The reveal is a small celebration of its own: whatever foil is left drops
 * off the card and a puff of foil flakes (plus the card owner's colors) goes
 * up from it. A losing card then gets a rubber stamp in the owner's ink; the
 * dialog layers the full takeover on top of that.
 */
export function ScratchCard({
  name,
  isLoser,
  scratched,
  onReveal,
}: {
  name: string;
  isLoser: boolean;
  scratched: boolean;
  onReveal: () => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const revealedRef = useRef(false);

  useEffect(() => {
    if (scratched) return;
    revealedRef.current = false;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    paintFoil(ctx, width, height);
  }, [scratched]);

  function pointerToLocal(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function scratchAt(x: number, y: number) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function checkErasedFraction() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || revealedRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const sampleStep = Math.max(4, Math.round(4 * dpr));
    const { width, height } = canvas;
    let transparent = 0;
    let total = 0;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4 * sampleStep) {
      total++;
      if (data[i] < 32) transparent++;
    }
    if (total > 0 && transparent / total > REVEAL_THRESHOLD) {
      revealedRef.current = true;
      onReveal();
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (scratched) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = pointerToLocal(event);
    scratchAt(point.x, point.y);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || scratched) return;
    const point = pointerToLocal(event);
    scratchAt(point.x, point.y);
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    checkErasedFraction();
  }

  const [from, to] = memberPalette(name);

  return (
    <div
      ref={containerRef}
      className="shadow-e1 relative aspect-[3/4] overflow-hidden rounded-xl border"
    >
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center",
          !isLoser && "bg-muted/30",
        )}
        style={
          isLoser ? { backgroundColor: `color-mix(in oklch, ${from} 16%, var(--card))` } : undefined
        }
      >
        <span className={cn("block rounded-full", scratched && isLoser && "animate-laugh-land")}>
          <GameAvatar name={name} className="size-8 text-sm" />
        </span>
        <span className="w-full truncate text-xs font-medium">{name}</span>
        {isLoser ? (
          scratched ? (
            <InkStamp
              label={t("expenses.scratchResultPay")}
              name={name}
              size="sm"
              className="mt-0.5"
            />
          ) : (
            // Holds the stamp's space while the foil is still on, so the
            // reveal never shifts the card's contents.
            <span className="h-6" />
          )
        ) : (
          <span
            className={cn(
              "font-heading text-muted-foreground text-sm font-semibold",
              scratched && "animate-rise",
            )}
          >
            {t("expenses.scratchResultSafe")}
          </span>
        )}
      </div>
      {scratched && isLoser && (
        <span
          aria-hidden="true"
          className="animate-settle-ring pointer-events-none absolute inset-2 rounded-lg border-2"
          style={{ borderColor: from }}
        />
      )}
      <AnimatePresence>
        {!scratched && (
          <motion.canvas
            key="foil"
            ref={canvasRef}
            className="absolute inset-0 size-full touch-none"
            aria-hidden="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            // What's left of the foil comes away in one piece and drops,
            // tipping as it goes, instead of blinking out.
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : {
                    opacity: 0,
                    y: 36,
                    rotate: nameHash(name) % 2 === 0 ? 9 : -9,
                    scale: 0.9,
                    transition: { duration: 0.38, ease: [0.4, 0, 1, 1] },
                  }
            }
          />
        )}
      </AnimatePresence>
      {!scratched && (
        // A slow sheen sweeping over the foil, inviting a thumb onto it.
        <span
          aria-hidden="true"
          className="animate-shimmer pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent"
        />
      )}
      {!scratched && (
        <button
          type="button"
          onClick={onReveal}
          aria-label={`${t("expenses.scratchRevealButton")} — ${name}`}
          className="ring-popover focus-visible:ring-ring/50 active:shadow-pressed bg-foreground/70 absolute right-1 bottom-1 z-10 flex size-7 items-center justify-center rounded-full text-white ring-2 outline-none focus-visible:ring-3"
        >
          <Eye className="size-3.5" aria-hidden="true" />
        </button>
      )}
      {scratched && (
        <ConfettiBurst
          anchorRef={containerRef}
          seed={nameHash(name)}
          colors={[FOIL_LIGHT, FOIL_DARK, FOIL_LIGHT, from, to]}
          count={isLoser ? 14 : 20}
          power={0.55}
        />
      )}
    </div>
  );
}
