"use client";

import { createContext, useContext, type ReactNode } from "react";
import { LOCALE_COOKIE, translate, type Locale, type TranslationKey } from "@/lib/i18n/translate";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Provides the active locale to the whole client tree. Unlike ThemeProvider,
 * this reads its initial value from a prop (the server-read `locale`
 * cookie — see lib/i18n/server.ts) rather than from storage picked up after
 * mount: text is rendered server-side, so the first client render must match
 * the server-rendered HTML exactly or React flags a hydration mismatch.
 * Switching locale writes the same cookie so the next server render agrees.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  function setLocale(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    window.location.reload();
  }

  return (
    <LocaleContext.Provider value={{ locale: initialLocale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

/** Bound translator for the active locale — a drop-in replacement for the old static `t()`. */
export function useT(): (key: TranslationKey, vars?: Record<string, string | number>) => string {
  const { locale } = useLocale();
  return (key, vars) => translate(locale, key, vars);
}
