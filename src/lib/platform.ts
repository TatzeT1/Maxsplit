/**
 * iPhone, iPad or iPod. iPadOS 13+ reports as "MacIntel" in the UA string,
 * so a touch-capable "Mac" is really an iPad.
 */
export function isIosDevice(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Launched from the home screen as an installed app, rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari never fires beforeinstallprompt/display-mode and instead
    // exposes this non-standard flag once launched from the home screen.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
