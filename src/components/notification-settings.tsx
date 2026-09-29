"use client";

import { Bell, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sendTestPush, updateNotificationPrefs } from "@/lib/actions/notifications";
import { callAction } from "@/lib/call-action";
import {
  currentSubscription,
  pushSupport,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from "@/lib/push/client";
import { PUSH_EVENTS, type NotificationPrefs, type PushEvent } from "@/lib/push/types";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";

type DeviceState = "checking" | "unsupported" | "ios-needs-install" | "denied" | "off" | "on";

const EVENT_LABEL: Record<PushEvent, TranslationKey> = {
  expense: "notifications.eventExpense",
  settlement: "notifications.eventSettlement",
  challenge: "notifications.eventChallenge",
  turn: "notifications.eventTurn",
};

async function detectDevice(): Promise<DeviceState> {
  const support = pushSupport();
  if (support !== "supported") return support;
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

/**
 * The profile's "Benachrichtigungen": turns push on or off for this device
 * (lib/push/client.ts), sends a test, and holds the four per-event switches,
 * which apply to every device of the account. Explains itself where push
 * can't work: an iPhone gets pushes only as a home-screen app, and a denied
 * permission can only be undone in the system settings.
 */
export function NotificationSettings({
  uid,
  vapidPublicKey,
  prefs: initialPrefs,
}: {
  uid: string;
  vapidPublicKey: string;
  prefs: NotificationPrefs;
}) {
  const t = useT();
  const { locale } = useLocale();
  const online = useOnline();
  const [device, setDevice] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [prefs, setPrefs] = useState(initialPrefs);

  useEffect(() => {
    let cancelled = false;
    detectDevice().then(
      (state) => !cancelled && setDevice(state),
      () => !cancelled && setDevice("unsupported"),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await subscribeThisDevice(uid, vapidPublicKey, locale);
      if (result.ok) setDevice("on");
      else if (result.error === "denied") setDevice("denied");
      else if (result.error !== "dismissed") {
        setMessage({ error: true, text: t("notifications.error") });
      }
    } catch (error) {
      console.error("Turning on push notifications failed", error);
      setMessage({ error: true, text: t("notifications.error") });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      await unsubscribeThisDevice();
      setDevice("off");
    } catch (error) {
      console.error("Turning off push notifications failed", error);
      setMessage({ error: true, text: t("notifications.error") });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    const result = await callAction(() => sendTestPush());
    setBusy(false);
    setMessage(
      result.ok
        ? { error: false, text: t("notifications.testSent") }
        : { error: true, text: t("notifications.testFailed") },
    );
  }

  async function togglePref(event: PushEvent, value: boolean) {
    const previous = prefs;
    const next = { ...prefs, [event]: value };
    setPrefs(next);
    setMessage(null);
    const result = await callAction(() => updateNotificationPrefs(next));
    if (!result.ok) {
      setPrefs(previous);
      setMessage({ error: true, text: t("notifications.prefsSaveError") });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t("notifications.intro")}</p>

      {device === "checking" && <Skeleton className="h-10 w-full" />}
      {device === "unsupported" && <p className="text-sm">{t("notifications.unsupported")}</p>}
      {device === "ios-needs-install" && <p className="text-sm">{t("notifications.iosInstall")}</p>}
      {device === "denied" && <p className="text-sm">{t("notifications.denied")}</p>}

      {device === "off" && (
        <Button type="button" className="w-fit" disabled={busy || !online} onClick={enable}>
          <Bell />
          {busy ? t("notifications.enabling") : t("notifications.enable")}
        </Button>
      )}

      {device === "on" && (
        <>
          <p className="text-success flex items-center gap-2 text-sm font-medium">
            <BellRing aria-hidden="true" className="size-4" />
            {t("notifications.activeOnDevice")}
          </p>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{t("notifications.eventsTitle")}</legend>
            <p className="text-muted-foreground mb-1 text-xs">{t("notifications.eventsHint")}</p>
            {PUSH_EVENTS.map((event) => (
              <label key={event} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs[event]}
                  disabled={!online}
                  onChange={(changeEvent) => void togglePref(event, changeEvent.target.checked)}
                  className="accent-primary size-4"
                />
                {t(EVENT_LABEL[event])}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || !online} onClick={sendTest}>
              {t("notifications.test")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy || !online} onClick={disable}>
              {t("notifications.disable")}
            </Button>
          </div>
        </>
      )}

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={cn("text-xs", message.error ? "text-destructive" : "text-muted-foreground")}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
