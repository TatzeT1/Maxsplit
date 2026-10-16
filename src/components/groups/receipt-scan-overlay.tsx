"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import { InkStamp } from "@/components/groups/split-game/celebration";
import type { TranslationKey } from "@/lib/i18n/translate";

/** What the scanner says it is doing, in turn — a model gives no progress, so this paces the wait. */
const STEPS: TranslationKey[] = [
  "receipt.stepFind",
  "receipt.stepNames",
  "receipt.stepPrices",
  "receipt.stepCount",
  "receipt.stepTotal",
];
const STEP_MS = 1_600;

/**
 * After this long the wait gets an honest explanation: an overloaded model is
 * retried and then swapped for the next one (lib/receipt/scan.ts), which
 * takes several seconds more than a plain read.
 */
const SLOW_AFTER_MS = 9_000;

/**
 * Where the "just read" highlights light up on the slip, as a share of its
 * height, and when — staggered against the beam's 2.4 s sweep, so a line
 * glints a beat after the beam has passed it rather than all at once.
 */
const GLINTS = [
  { top: 22, delay: 0.25 },
  { top: 34, delay: 0.55 },
  { top: 46, delay: 0.85 },
  { top: 58, delay: 1.15 },
  { top: 74, delay: 1.5 },
];

/**
 * The wait while a vision model reads a receipt photo: the photo printed on
 * a till slip (the app's receipt vocabulary, see Design System and Theming),
 * a scanner beam sweeping it, lines lighting up as if read, and a status line
 * that moves on every 1.6 s. When the items are in, `itemCount` is set and an
 * ink stamp lands on the slip; the parent closes this a moment later.
 *
 * Reduced motion: no beam and no glints (decoration), the status line still
 * changes — it is the only sign anything is happening.
 */
export function ReceiptScanOverlay({
  open,
  image,
  itemCount,
  onCancel,
}: {
  open: boolean;
  /** The photo as it was sent — `null` while it is still being scaled down. */
  image: string | null;
  /** Set once the items are read: the stamp lands. */
  itemCount: number | null;
  onCancel: () => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const done = itemCount !== null;
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!open || done) return;
    const ticker = setInterval(() => setStep((current) => (current + 1) % STEPS.length), STEP_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearInterval(ticker);
      clearTimeout(slowTimer);
    };
  }, [open, done]);

  const status = done
    ? t("receipt.stepDone", { count: itemCount })
    : image
      ? t(STEPS[step])
      : t("receipt.stepPrepare");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !done && onCancel()}>
      <DialogContent showCloseButton={false} onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("receipt.scanningTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("receipt.scanning")}</DialogDescription>
        </DialogHeader>

        <div className="relative mx-auto w-full max-w-64 drop-shadow-[0_10px_18px_rgb(0_0_0/0.28)]">
          <div
            className="receipt-edges paper-tokens bg-card relative aspect-[3/4] overflow-hidden px-3 py-4"
            data-testid="receipt-scan-slip"
          >
            {image ? (
              // A data URL the browser already holds: next/image would only add a round trip.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="h-full w-full object-cover object-top contrast-125 grayscale-[35%] sepia-[15%]"
              />
            ) : (
              <div className="flex h-full flex-col justify-center gap-3 px-2">
                {[80, 55, 70, 45, 65].map((width, index) => (
                  <div
                    key={index}
                    className="bg-muted animate-shimmer h-2.5 rounded-sm bg-linear-to-r from-transparent via-[color-mix(in_oklch,var(--foreground),transparent_88%)] to-transparent"
                    style={{ width: `${width}%` }}
                  />
                ))}
              </div>
            )}

            {image && !done && !reduceMotion && (
              <>
                {GLINTS.map(({ top, delay }) => (
                  <span
                    key={top}
                    aria-hidden="true"
                    className="animate-scan-glint bg-primary/10 border-primary/60 absolute inset-x-3 h-[5%] rounded-sm border-l-[3px]"
                    style={{ top: `${top}%`, animationDelay: `${delay}s` }}
                  />
                ))}
                <span
                  aria-hidden="true"
                  data-testid="receipt-scan-beam"
                  className="animate-scan-sweep pointer-events-none absolute inset-x-0 h-0.5"
                >
                  {/* The light the beam throws ahead of itself, then the beam's own glow. */}
                  <span className="from-primary/0 to-primary/30 absolute inset-x-0 bottom-0 h-10 bg-linear-to-b" />
                  <span className="bg-primary absolute inset-0 shadow-[0_0_12px_3px_var(--primary)]" />
                </span>
              </>
            )}

            {/* Viewfinder corners: it's being looked at, not just shown. */}
            {!done &&
              [
                "top-2 left-2 border-t-2 border-l-2",
                "top-2 right-2 border-t-2 border-r-2",
                "bottom-2 left-2 border-b-2 border-l-2",
                "bottom-2 right-2 border-b-2 border-r-2",
              ].map((corner) => (
                <span
                  key={corner}
                  aria-hidden="true"
                  className={`border-primary ${reduceMotion ? "" : "animate-breathe"} absolute size-5 rounded-[3px] ${corner}`}
                />
              ))}
          </div>

          {done && (
            <div className="absolute inset-0 flex items-center justify-center">
              <InkStamp
                label={t("receipt.stamp", { count: itemCount })}
                name="receipt"
                ink="var(--success)"
                delay={0}
                className="dark:mix-blend-multiply"
              />
            </div>
          )}
        </div>

        <div className="flex min-h-12 flex-col items-center gap-1 text-center" aria-live="polite">
          {/* One grid cell for every line: the outgoing one rises away while the
              next rises in underneath, a crossfade rather than a gap. */}
          <div className="grid">
            <AnimatePresence initial={false}>
              <motion.p
                key={status}
                className="text-foreground col-start-1 row-start-1 text-base font-medium"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {done ? "✓ " : "✨ "}
                {status}
              </motion.p>
            </AnimatePresence>
          </div>
          {slow && !done && (
            <p className="text-muted-foreground text-xs">{t("receipt.stepSlow")}</p>
          )}
        </div>

        {/* Kept in place once done, just hidden: removing it would make the dialog jump as the stamp lands. */}
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={done}
          className={done ? "invisible" : undefined}
        >
          {t("common.cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
