import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  translate,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n/translate";

/** Reads the locale cookie set by LocaleProvider; falls back to the default when absent or invalid. */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Bound translator for the request's locale — for Server Components rendering text directly. */
export async function getServerT(): Promise<
  (key: TranslationKey, vars?: Record<string, string | number>) => string
> {
  const locale = await getLocale();
  return (key, vars) => translate(locale, key, vars);
}
