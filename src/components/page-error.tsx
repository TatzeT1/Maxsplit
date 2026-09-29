"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { TranslationKey } from "@/lib/i18n/translate";

/**
 * The fallback every error boundary renders (app/error.tsx, the (app) one,
 * and global-error.tsx): what happened, that nothing was lost, and two ways
 * out. It takes `t` rather than calling useT() because global-error.tsx
 * replaces the root layout — and with it the LocaleProvider — so it
 * translates on its own.
 *
 * The error is always logged: a render crash must never be silent (see the
 * "never swallow" rule in AGENTS.md). `digest` is the id Next gives a server
 * error in production to match it against the server logs; it's shown so a
 * report from a phone screenshot can be traced.
 */
export function PageError({
  error,
  retry,
  t,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div
        role="alert"
        className="bg-card ring-foreground/10 shadow-e1 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl p-6 text-center ring-1"
      >
        <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
          <TriangleAlert aria-hidden="true" className="size-6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-xl leading-tight font-medium">
            {t("errors.pageErrorTitle")}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">{t("errors.pageErrorBody")}</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button type="button" size="lg" className="w-full" onClick={() => retry()}>
            <RotateCcw />
            {t("errors.retry")}
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/groups">{t("errors.backToGroups")}</Link>
          </Button>
        </div>
        {error.digest && (
          <p className="text-muted-foreground font-mono text-xs">
            {t("errors.errorCode", { code: error.digest })}
          </p>
        )}
      </div>
    </div>
  );
}
