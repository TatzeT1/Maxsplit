"use client";

import { Check, Copy, ExternalLink, TriangleAlert } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  detectInAppBrowser,
  externalBrowserUrl,
  type InAppBrowserPlatform,
} from "@/lib/auth/in-app-browser";

const noop = () => () => {};

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readPlatform(): InAppBrowserPlatform | null {
  const { inApp, platform } = detectInAppBrowser(navigator.userAgent, {
    standalone: isStandalone(),
  });
  return inApp ? platform : null;
}

/** The in-app browser's platform, or null in a real browser (and on the server). */
function useInAppPlatform(): InAppBrowserPlatform | null {
  return useSyncExternalStore(noop, readPlatform, () => null);
}

/** True inside a messenger's or social app's built-in browser. */
export function useInAppBrowser(): boolean {
  return useInAppPlatform() !== null;
}

/**
 * Shown above sign-in when the page runs inside WhatsApp, Instagram & co.:
 * says why Google won't work here and offers the way out — open the real
 * browser, or copy the link for it — while email sign-in stays available
 * right below.
 */
export function InAppBrowserNotice() {
  const t = useT();
  const platform = useInAppPlatform();
  const [copied, setCopied] = useState(false);
  if (platform === null) return null;

  const openUrl = externalBrowserUrl(window.location.href, platform);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      role="note"
      className="border-primary/40 bg-primary/5 flex flex-col gap-3 rounded-xl border p-4 text-left"
    >
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="text-primary size-4 shrink-0" />
        {t("auth.inAppTitle")}
      </p>
      <p className="text-sm text-pretty">{t("auth.inAppBody")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {openUrl && (
          <Button asChild size="lg" className="flex-1 gap-2">
            <a href={openUrl}>
              <ExternalLink className="size-4" />
              {t("auth.inAppOpen")}
            </a>
          </Button>
        )}
        <Button variant="outline" size="lg" className="flex-1 gap-2" onClick={copyLink}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {t("auth.inAppCopy")}
        </Button>
      </div>
      {copied && (
        <p className="text-muted-foreground text-xs" role="status">
          {t("auth.inAppCopied")}
        </p>
      )}
    </div>
  );
}
