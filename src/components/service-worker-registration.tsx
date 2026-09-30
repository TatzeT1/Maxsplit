"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { dismissNotificationsFor } from "@/lib/push/dismiss";

function workerEnabled(): boolean {
  return process.env.NODE_ENV === "production" && "serviceWorker" in navigator;
}

/**
 * Registers public/sw.js, which lets the installed app start offline and
 * shows push notifications (see the file). Production builds only: in dev,
 * a worker keeping Turbopack's constantly changing chunks would serve stale
 * code after every edit.
 *
 * Also reports every page the app shows to the worker, which saves it. The
 * app moves between pages client-side, so the worker never sees those as page
 * loads — without this it only ever saved pages opened by a full reload, and
 * the installed app opened offline to "Dafür brauchst du Internet" (found on
 * a real iPhone; a test that navigated with full page loads never showed it).
 *
 * And while a page is on screen, clears the notifications that lead to it
 * (lib/push/dismiss.ts): read the chat, and its pushes leave the lock screen.
 */
export function ServiceWorkerRegistration() {
  const pathname = usePathname();

  useEffect(() => {
    if (!workerEnabled()) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => console.error("Service worker registration failed", error));
  }, []);

  useEffect(() => {
    if (!workerEnabled()) return;
    const report = (worker: ServiceWorker | null | undefined) => {
      if (navigator.onLine) worker?.postMessage({ type: "save-page", path: pathname });
    };
    navigator.serviceWorker.ready
      .then((registration) => report(registration.active))
      .catch(() => {});
    // A worker that takes over mid-visit — the first install, or an update,
    // whose predecessor ignored the report above — hasn't heard of this page.
    const onControllerChange = () => report(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, [pathname]);

  useEffect(() => {
    if (!workerEnabled()) return;
    const dismiss = () => {
      if (document.visibilityState === "visible") void dismissNotificationsFor(pathname);
    };
    dismiss();
    // Back from the background onto this page; or a push for it arriving while
    // it's open (the worker has to show every push, then tells us).
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "notification-shown") dismiss();
    };
    document.addEventListener("visibilitychange", dismiss);
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", dismiss);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [pathname]);

  return null;
}
