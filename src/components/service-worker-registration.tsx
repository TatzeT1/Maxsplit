"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, which lets the installed app start offline and
 * shows push notifications (see the file). Production builds only: in dev,
 * a worker keeping Turbopack's constantly changing chunks would serve stale
 * code after every edit.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => console.error("Service worker registration failed", error));
  }, []);

  return null;
}
