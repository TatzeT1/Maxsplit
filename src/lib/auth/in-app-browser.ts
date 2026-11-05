/**
 * Detects the embedded browsers of messenger and social apps (Instagram,
 * Facebook, TikTok, Snapchat, LINE, Telegram, generic Android WebViews, iOS
 * WKWebViews). Google refuses its OAuth sign-in inside them with a bare
 * "403 disallowed_useragent" page in the popup — no Firebase error ever
 * reaches the app, so a first-time user just sees "nothing happens". Invite
 * links are mostly opened from a chat, so this is exactly where newcomers
 * land.
 *
 * Email/password sign-in works fine in these views; only Google doesn't.
 */
export type InAppBrowserPlatform = "android" | "ios" | "other";

const APP_TOKENS =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|Telegram|Twitter|Pinterest|LinkedInApp|MicroMessenger/i;

export function detectInAppBrowser(
  userAgent: string,
  { standalone = false }: { standalone?: boolean } = {},
): { inApp: boolean; platform: InAppBrowserPlatform } {
  const isAndroid = /Android/i.test(userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const platform: InAppBrowserPlatform = isAndroid ? "android" : isIos ? "ios" : "other";

  // The home-screen app on iOS has no "Safari/" token either, but it's a real
  // browser context where Google sign-in works — never flag it.
  if (standalone) return { inApp: false, platform };

  if (APP_TOKENS.test(userAgent)) return { inApp: true, platform };
  // Android System WebView marks itself with "; wv)".
  if (isAndroid && /;\s*wv\)/.test(userAgent)) return { inApp: true, platform };
  // A WKWebView reports "Mobile/…" but, unlike Safari, Chrome, Firefox and
  // SFSafariViewController, no "Safari/" token.
  if (isIos && /Mobile\//.test(userAgent) && !/Safari\//.test(userAgent)) {
    return { inApp: true, platform };
  }
  return { inApp: false, platform };
}

/**
 * A link that asks the OS to open `url` in the real browser: Chrome via an
 * intent on Android, Safari via its `x-safari-` scheme on iOS (17+). Null
 * where there is no such scheme — the caller offers "copy link" instead.
 */
export function externalBrowserUrl(url: string, platform: InAppBrowserPlatform): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (platform === "android") {
    const rest = `${parsed.host}${parsed.pathname}${parsed.search}`;
    return `intent://${rest}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  }
  if (platform === "ios") return `x-safari-${url}`;
  return null;
}
