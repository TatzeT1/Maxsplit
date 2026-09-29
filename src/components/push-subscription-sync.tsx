"use client";

import { useEffect } from "react";
import { useLocale } from "@/components/locale-provider";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { syncThisDevice } from "@/lib/push/client";

/**
 * Keeps the server's copy of this device's push subscription current on
 * every app start (lib/push/client.ts): after a language switch, when
 * another account signs in on the phone, or when the browser rotated the
 * endpoint. Does nothing on devices without push turned on.
 */
export function PushSubscriptionSync() {
  const user = useCurrentUser();
  const { locale } = useLocale();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    syncThisDevice(uid, locale).catch((error: unknown) =>
      console.error("Could not sync the push subscription", error),
    );
  }, [uid, locale]);

  return null;
}
