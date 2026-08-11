import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";

export type Locale = "de" | "en";

export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "de" || value === "en";
}

/** Same nested shape as a dictionary, but every leaf widened to `string` — the type a translated dictionary must match, without forcing its strings to literally equal the German ones. */
export type Dictionary = {
  [K in keyof typeof de]: (typeof de)[K] extends string
    ? string
    : { [J in keyof (typeof de)[K]]: string };
};

const dictionaries: Record<Locale, Dictionary> = { de, en };

type DotPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPaths<T[K]>}`;
    }[keyof T & string];

export type TranslationKey = DotPaths<typeof de>;

function resolve(locale: Locale, path: string): string {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (typeof node === "object" && node !== null && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, dictionaries[locale]);

  if (typeof value !== "string") {
    throw new Error(`Missing translation for key "${path}" in locale "${locale}"`);
  }
  return value;
}

/**
 * Look up a UI string by dot path in the given locale, optionally
 * interpolating `{{placeholder}}` tokens, e.g.
 * `translate("de", "balances.youOwe", { name: "Anna", amount: "12,50 €" })`.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const template = resolve(locale, key);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) =>
    token in vars ? String(vars[token]) : match,
  );
}
