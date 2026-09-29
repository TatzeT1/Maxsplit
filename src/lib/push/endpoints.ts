// The push services browsers actually use. A subscription's endpoint comes
// from the client, and the server POSTs to it — so only these hosts are
// accepted, never an arbitrary URL (which would turn "send a push" into
// "make the server call any address I like").
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Samsung Internet, Opera, …
  "android.googleapis.com", // older Chrome subscriptions
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari on iPhone (home screen app), iPad and Mac
  "notify.windows.com", // Edge on Windows
];

/** Extra hosts, for a local end-to-end test against a fake push service only. */
function extraHosts(): string[] {
  return (process.env.PUSH_EXTRA_ENDPOINT_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (extraHosts().includes(url.host)) return true;
  return PUSH_SERVICE_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}
