"use client";

import { PageError } from "@/components/page-error";
import { DEFAULT_LOCALE, translate, type TranslationKey } from "@/lib/i18n/translate";
import "./globals.css";

// Only rendered when the root layout itself fails, so it replaces the whole
// document: no LocaleProvider (German, the product language, is used
// directly), no theme script (dark, the app's default theme, is applied
// statically), and the global stylesheet imported here, since the root
// layout's import doesn't reach this file.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(DEFAULT_LOCALE, key, vars);

  return (
    <html lang={DEFAULT_LOCALE} className="dark h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>{t("errors.pageErrorTitle")}</title>
        <PageError error={error} retry={retry} t={t} />
      </body>
    </html>
  );
}
