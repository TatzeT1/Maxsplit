"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_STYLES, type AppStyle, isAppStyle, setAppStyle, useAppStyle } from "@/lib/app-style";
import type { TranslationKey } from "@/lib/i18n/translate";

const STYLE_COPY: Record<AppStyle, { name: TranslationKey; hint: TranslationKey }> = {
  graphit: { name: "theme.styleGraphit", hint: "theme.styleGraphitHint" },
  original: { name: "theme.styleOriginal", hint: "theme.styleOriginalHint" },
  fallblatt: { name: "theme.styleFallblatt", hint: "theme.styleFallblattHint" },
  bierdeckel: { name: "theme.styleBierdeckel", hint: "theme.styleBierdeckelHint" },
  riso: { name: "theme.styleRiso", hint: "theme.styleRisoHint" },
  schmetterling: { name: "theme.styleSchmetterling", hint: "theme.styleSchmetterlingHint" },
  herzblatt: { name: "theme.styleHerzblatt", hint: "theme.styleHerzblattHint" },
};

/** Appearance menu: light/dark/system, and below it the app's visual style. */
export function ThemeToggle({
  size = "icon",
  onOpenChange,
}: {
  size?: "icon" | "icon-lg";
  onOpenChange?: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const style = useAppStyle();
  const t = useT();

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label={t("theme.toggleLabel")}>
          <Sun className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("theme.modeLabel")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system") setTheme(value);
          }}
        >
          <DropdownMenuRadioItem value="light">{t("theme.light")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t("theme.dark")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{t("theme.system")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("theme.styleLabel")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={style}
          onValueChange={(value) => {
            if (isAppStyle(value)) setAppStyle(value);
          }}
        >
          {APP_STYLES.map((id) => (
            <DropdownMenuRadioItem key={id} value={id} className="items-start py-1.5">
              <span className="style-swatch mt-0.5" data-swatch={id} aria-hidden="true" />
              <span className="flex flex-col">
                <span>{t(STYLE_COPY[id].name)}</span>
                <span className="text-muted-foreground text-xs">{t(STYLE_COPY[id].hint)}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
