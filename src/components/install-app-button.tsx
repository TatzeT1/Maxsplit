"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Module-level store for the deferred `beforeinstallprompt` event — it can
 * fire at any point after page load, well before this component might
 * mount, so it's captured as an external source `useSyncExternalStore`
 * subscribes to rather than a `useEffect` + `setState` pair.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    promptListeners.forEach((listener) => listener());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    promptListeners.forEach((listener) => listener());
  });
}

function subscribeToInstallPrompt(onStoreChange: () => void) {
  promptListeners.add(onStoreChange);
  return () => promptListeners.delete(onStoreChange);
}

function getInstallPromptSnapshot() {
  return deferredPrompt;
}

function getInstallPromptServerSnapshot() {
  return null;
}

function noSubscription() {
  return () => {};
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari never fires beforeinstallprompt/display-mode and instead
    // exposes this non-standard flag once launched from the home screen.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSnapshot(): boolean {
  // iPadOS 13+ reports as "MacIntel" in the UA string, so a touch-capable
  // "Mac" is really an iPad.
  const isIosDevice =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIosDevice && !isStandalone();
}

/**
 * Chromium browsers (Android, desktop Chrome/Edge) fire `beforeinstallprompt`
 * and let us trigger the native install dialog directly. Safari (iOS and
 * macOS) never fires it — there, the button instead opens a dialog walking
 * through the manual Share > Add to Home Screen steps, since that flow isn't
 * something the page can trigger programmatically.
 */
export function InstallAppButton() {
  const t = useT();
  const [showIosDialog, setShowIosDialog] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const installPromptEvent = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallPromptSnapshot,
    getInstallPromptServerSnapshot,
  );
  const isIos = useSyncExternalStore(noSubscription, isIosSnapshot, () => false);

  if (dismissed || (!installPromptEvent && !isIos)) return null;

  async function handleClick() {
    if (!installPromptEvent) {
      setShowIosDialog(true);
      return;
    }
    await installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    deferredPrompt = null;
    promptListeners.forEach((listener) => listener());
    if (outcome === "accepted") setDismissed(true);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleClick}>
        <Download />
        <span className="hidden sm:inline">{t("installApp.button")}</span>
      </Button>
      <Dialog open={showIosDialog} onOpenChange={setShowIosDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("installApp.iosTitle")}</DialogTitle>
            <DialogDescription>{t("installApp.iosDescription")}</DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-center gap-3">
              <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                <Share className="size-4" />
              </span>
              {t("installApp.iosStep1")}
            </li>
            <li className="flex items-center gap-3">
              <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                <SquarePlus className="size-4" />
              </span>
              {t("installApp.iosStep2")}
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
