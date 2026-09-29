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
