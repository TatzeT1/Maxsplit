// Clears notifications whose news the app is showing right now — so reading
// the chat on the phone also takes its messages off the lock screen, and the
// notification centre doesn't fill up with things already seen. Every push is
// still delivered and shown; this only tidies up afterwards.
//
// Keyed on the page a notification leads to (its `url`, see
// messages.ts): the chat → that group's chat pushes, the group page → its
// expenses and payments, a tournament → its challenge and "Du bist dran".

/** Whether a notification leading to `url` is about the page at `pathname`. */
export function leadsTo(url: unknown, pathname: string, origin: string): boolean {
  if (typeof url !== "string") return false;
  try {
    const target = new URL(url, origin);
    return target.origin === origin && target.pathname === pathname;
  } catch {
    return false;
  }
}

/** Closes this device's notifications that lead to `pathname`. Best effort — never throws. */
export async function dismissNotificationsFor(pathname: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration || typeof registration.getNotifications !== "function") return;
    for (const notification of await registration.getNotifications()) {
      const data = notification.data as { url?: unknown } | null;
      if (leadsTo(data?.url, pathname, window.location.origin)) notification.close();
    }
  } catch {
    // Notifications left standing are only untidy.
  }
}
