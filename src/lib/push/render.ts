import { translate, type Locale } from "@/lib/i18n/translate";
import type { PendingPush, PushPayload, PushText } from "./types";

function render(text: PushText, locale: Locale): string {
  const vars = Object.fromEntries(
    Object.entries(text.vars ?? {}).map(([name, value]) => [
      name,
      typeof value === "object" ? translate(locale, value.key) : value,
    ]),
  );
  return translate(locale, text.key, vars);
}

/** A push as one device receives it: written out in that device's language. */
export function renderPayload(push: PendingPush, locale: Locale): PushPayload {
  return {
    title: render(push.title, locale),
    body: push.body.map((text) => render(text, locale)).join(" – "),
    url: push.url,
    tag: push.tag,
  };
}
