"use client";

import { Check, Plus } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { Coaster, FlapFigure, RisoPrint } from "@/components/groups/style-hero";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { monogramVars } from "@/components/ui/monogram";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_STYLES, type AppStyle, setAppStyle, useAppStyle } from "@/lib/app-style";
import { formatMoney } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

export const STYLE_COPY: Record<AppStyle, { name: TranslationKey; hint: TranslationKey }> = {
  graphit: { name: "theme.styleGraphit", hint: "theme.styleGraphitHint" },
  original: { name: "theme.styleOriginal", hint: "theme.styleOriginalHint" },
  fallblatt: { name: "theme.styleFallblatt", hint: "theme.styleFallblattHint" },
  bierdeckel: { name: "theme.styleBierdeckel", hint: "theme.styleBierdeckelHint" },
  riso: { name: "theme.styleRiso", hint: "theme.styleRisoHint" },
  schmetterling: { name: "theme.styleSchmetterling", hint: "theme.styleSchmetterlingHint" },
  herzblatt: { name: "theme.styleHerzblatt", hint: "theme.styleHerzblattHint" },
};

/**
 * The style gallery: every style as a small screen of the app, side by side,
 * in the current light/dark mode. Tapping one switches the whole app at once
 * (the dialog included), so the cards compare and the app behind confirms.
 */
export function StylePickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const active = useAppStyle();
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-5 sm:max-w-2xl lg:max-w-4xl"
        // Land on the dialog itself, not its first control: a focus ring on
        // the light/dark switch reads as "this is what you should change".
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl">{t("theme.stylesTitle")}</DialogTitle>
          <DialogDescription>{t("theme.stylesDescription")}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={theme}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system") setTheme(value);
          }}
        >
          <TabsList aria-label={t("theme.modeLabel")}>
            <TabsTrigger value="light">{t("theme.light")}</TabsTrigger>
            <TabsTrigger value="dark">{t("theme.dark")}</TabsTrigger>
            <TabsTrigger value="system">{t("theme.system")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {APP_STYLES.map((id) => {
            const selected = id === active;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAppStyle(id)}
                  className="group/style focus-visible:ring-ring/50 flex w-full touch-manipulation flex-col gap-2 rounded-xl text-left outline-none focus-visible:ring-3"
                >
                  <span
                    className={cn(
                      "ring-foreground/10 block w-full overflow-hidden rounded-xl ring-1 transition-[box-shadow,transform] duration-(--duration-fast) ease-(--ease-standard) group-active/style:scale-[0.98]",
                      selected && "ring-primary ring-offset-popover ring-2 ring-offset-2",
                    )}
                  >
                    <StylePreview style={id} />
                  </span>
                  <span className="flex items-start gap-1.5 px-0.5">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{t(STYLE_COPY[id].name)}</span>
                      <span className="text-muted-foreground text-xs leading-snug">
                        {t(STYLE_COPY[id].hint)}
                      </span>
                    </span>
                    {selected && (
                      <span className="bg-primary text-primary-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                        <Check className="size-3.5" strokeWidth={3} />
                        <span className="sr-only">{t("theme.styleActive")}</span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="lg">{t("theme.stylesDone")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PREVIEW_FIGURE_MINOR = 52945;
const PREVIEW_PEOPLE = ["Lena", "Tom", "Ali"];

/**
 * A small screen of the app in one style: the groups overview's headline
 * figure in that style's own form, two expenses, a chat bubble and the one
 * button that matters. Laid out at phone size (a fixed height that fits the
 * tallest hero, the beer mat) and shrunk with `zoom`, so fonts, radii and the
 * backdrop motif keep their real proportions.
 *
 * Everything style-dependent goes through `data-style-preview` and the
 * `preview-*` twins of the style hooks (app-styles.css) — never through the
 * page's own hooks (`.display-figure`, `.monogram`, …), which follow the
 * active style and would leak into every card.
 */
export function StylePreview({ style }: { style: AppStyle }) {
  const t = useT();
  const figure = formatMoney(PREVIEW_FIGURE_MINOR, "EUR");
  const label = t("theme.previewLabel");

  return (
    <span
      aria-hidden="true"
      data-style-preview={style}
      className="relative isolate block h-[540px] w-full [zoom:0.46] overflow-hidden"
    >
      <span className="absolute inset-0 -z-10 overflow-hidden">
        <span className="preview-light absolute inset-0" />
        <span className="preview-texture absolute inset-0" />
        <span className="bg-grain absolute inset-0" />
      </span>

      <span className="flex h-full flex-col gap-5 p-5">
        <span className="flex items-center justify-between">
          <span className="preview-heading flex items-center gap-2 text-lg font-medium">
            <span className="preview-brand flex size-7 items-center justify-center rounded-[0.55rem]">
              <svg viewBox="0 0 24 24" className="preview-brand-glyph size-[78%]">
                <path d="M11 4.57A7.5 7.5 0 0 0 10.6 19.37V12.4L11 11.8Z" />
                <path d="M12.9 4.55A7.5 7.5 0 0 1 12.4 19.49V12.2L12.9 11.6Z" />
              </svg>
            </span>
            {t("app.name")}
          </span>
          <span className="flex -space-x-2">
            {PREVIEW_PEOPLE.map((name) => (
              <span
                key={name}
                style={monogramVars(name)}
                className="preview-monogram flex size-8 items-center justify-center rounded-full text-sm font-semibold"
              >
                {name.charAt(0)}
              </span>
            ))}
          </span>
        </span>

        <PreviewHero style={style} label={label} figure={figure} />

        <span className="flex flex-col gap-2">
          <PreviewExpense
            person={PREVIEW_PEOPLE[0]}
            title={t("theme.previewExpenseA")}
            meta={t("theme.previewExpenseAMeta")}
            amount={formatMoney(4200, "EUR")}
          />
          <PreviewExpense
            person={PREVIEW_PEOPLE[1]}
            title={t("theme.previewExpenseB")}
            meta={t("theme.previewExpenseBMeta")}
            amount={formatMoney(1860, "EUR")}
          />
        </span>

        <span className="preview-bubble self-end rounded-2xl rounded-br-md px-3.5 py-2 text-[15px]">
          {t("theme.previewBubble")}
        </span>

        <span className="preview-button bg-primary text-primary-foreground shadow-e1 mt-auto flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-linear-to-b from-white/10 to-transparent text-base font-medium">
          <Plus className="size-5" />
          {t("expenses.add")}
        </span>
      </span>
    </span>
  );
}

function PreviewHero({ style, label, figure }: { style: AppStyle; label: string; figure: string }) {
  const t = useT();

  if (style === "fallblatt") {
    return (
      <span className="hero-board flex flex-col gap-3">
        <span className="hero-board-label">{label}</span>
        <FlapFigure text={figure} />
      </span>
    );
  }

  if (style === "bierdeckel") {
    return (
      <span className="flex justify-center">
        <Coaster rim={t("groups.coasterRim", { count: 3 })} tally={3}>
          <span className="coaster-label">{label}</span>
          <span className="preview-figure coaster-figure">{figure}</span>
        </Coaster>
      </span>
    );
  }

  const caption = (
    <span className="flex items-center gap-2 text-sm">
      <span className="bg-success size-1.5 rounded-full" />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );

  if (style === "riso") {
    return (
      <span className="flex flex-col gap-2">
        {caption}
        <RisoPrint text={figure} className="text-[3.6rem]" />
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-2">
      {caption}
      <span className="preview-figure block pb-1 text-[3.6rem]">{figure}</span>
    </span>
  );
}

function PreviewExpense({
  person,
  title,
  meta,
  amount,
}: {
  person: string;
  title: string;
  meta: string;
  amount: string;
}) {
  return (
    <span className="bg-card text-card-foreground shadow-e1 flex items-center gap-3 rounded-xl px-3 py-2.5">
      <span
        style={monogramVars(person)}
        className="preview-monogram flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
      >
        {person.charAt(0)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium">{title}</span>
        <span className="text-muted-foreground truncate text-xs">{meta}</span>
      </span>
      <span className="text-[15px] font-medium tabular-nums">{amount}</span>
    </span>
  );
}
