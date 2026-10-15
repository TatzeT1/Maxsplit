"use client";

import { useSyncExternalStore } from "react";

/**
 * The app's visual styles, orthogonal to light/dark: every style has both.
 *
 * The active style lives on `<html data-style="…">`, set before first paint
 * by `THEME_INIT_SCRIPT` in app/layout.tsx and switched by `setAppStyle`.
 * CSS does almost all of the work (token sets in globals.css keyed on the
 * attribute); components only read it for the few signature pieces that
 * differ in markup, not just in color (the groups overview's hero figure).
 */
export const APP_STYLES = [
  "graphit",
  "original",
  "fallblatt",
  "bierdeckel",
  "riso",
  "schmetterling",
  "herzblatt",
] as const;
export type AppStyle = (typeof APP_STYLES)[number];

export const DEFAULT_APP_STYLE: AppStyle = "graphit";

/** localStorage key. Keep in sync with THEME_INIT_SCRIPT in app/layout.tsx. */
export const APP_STYLE_STORAGE_KEY = "style";

export function isAppStyle(value: unknown): value is AppStyle {
  return typeof value === "string" && (APP_STYLES as readonly string[]).includes(value);
}

function readAppStyle(): AppStyle {
  const value = document.documentElement.dataset.style;
  return isAppStyle(value) ? value : DEFAULT_APP_STYLE;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-style"] });
  return () => observer.disconnect();
}

export function setAppStyle(style: AppStyle): void {
  document.documentElement.dataset.style = style;
  try {
    window.localStorage.setItem(APP_STYLE_STORAGE_KEY, style);
  } catch {
    // Private mode or blocked storage: the switch still applies for this visit.
  }
}

/**
 * The active style. The server snapshot is the default, so hydration always
 * matches the server HTML and React re-renders with the stored style right
 * after — no mismatch warning, no provider needed.
 */
export function useAppStyle(): AppStyle {
  return useSyncExternalStore(subscribe, readAppStyle, () => DEFAULT_APP_STYLE);
}
