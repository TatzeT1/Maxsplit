import { describe, expect, it } from "vitest";
import { detectInAppBrowser, externalBrowserUrl } from "./in-app-browser";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IOS_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0";
const IOS_WKWEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_FACEBOOK = `${ANDROID_CHROME} [FB_IAB/FB4A;FBAV/480.0.0.0;]`;
const DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("detectInAppBrowser", () => {
  it("leaves real browsers alone", () => {
    expect(detectInAppBrowser(IOS_SAFARI)).toEqual({ inApp: false, platform: "ios" });
    expect(detectInAppBrowser(ANDROID_CHROME)).toEqual({ inApp: false, platform: "android" });
    expect(detectInAppBrowser(DESKTOP)).toEqual({ inApp: false, platform: "other" });
  });

  it("flags app browsers on both platforms", () => {
    expect(detectInAppBrowser(IOS_INSTAGRAM).inApp).toBe(true);
    expect(detectInAppBrowser(IOS_WKWEBVIEW).inApp).toBe(true);
    expect(detectInAppBrowser(ANDROID_WEBVIEW).inApp).toBe(true);
    expect(detectInAppBrowser(ANDROID_FACEBOOK).inApp).toBe(true);
  });

  it("never flags the installed home-screen app", () => {
    expect(detectInAppBrowser(IOS_WKWEBVIEW, { standalone: true }).inApp).toBe(false);
  });
});

describe("externalBrowserUrl", () => {
  const url = "https://example.app/invite/AB3F9K7Q?x=1";

  it("builds a Chrome intent on Android", () => {
    expect(externalBrowserUrl(url, "android")).toBe(
      `intent://example.app/invite/AB3F9K7Q?x=1#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(url)};end`,
    );
  });

  it("uses the Safari scheme on iOS", () => {
    expect(externalBrowserUrl(url, "ios")).toBe(`x-safari-${url}`);
  });

  it("has nothing elsewhere or for non-https", () => {
    expect(externalBrowserUrl(url, "other")).toBeNull();
    expect(externalBrowserUrl("http://localhost:3000/", "android")).toBeNull();
  });
});
