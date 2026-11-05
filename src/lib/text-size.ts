"use client";

import { useSyncExternalStore } from "react";

/**
 * A per-device text size, for people who find the default hard to read.
 * Lives on `<html data-text-size="…">` (set before first paint by
 * THEME_INIT_SCRIPT in app/layout.tsx); globals.css scales the root font size
 * for it, and since Tailwind sizes in rem, the whole layout grows with it.
 */
export const TEXT_SIZES = ["normal", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** localStorage key. Keep in sync with THEME_INIT_SCRIPT in app/layout.tsx. */
export const TEXT_SIZE_STORAGE_KEY = "textSize";

export function isTextSize(value: unknown): value is TextSize {
  return typeof value === "string" && (TEXT_SIZES as readonly string[]).includes(value);
}

function readTextSize(): TextSize {
  const value = document.documentElement.dataset.textSize;
  return isTextSize(value) ? value : "normal";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-text-size"],
  });
  return () => observer.disconnect();
}

export function setTextSize(size: TextSize): void {
  const root = document.documentElement;
  if (size === "normal") delete root.dataset.textSize;
  else root.dataset.textSize = size;
  try {
    if (size === "normal") window.localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    else window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Storage blocked: the size still applies for this visit.
  }
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, readTextSize, () => "normal");
}
