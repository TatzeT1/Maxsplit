"use client";

import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/components/locale-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageToggle({
  size = "icon",
  onOpenChange,
}: {
  size?: "icon" | "icon-lg";
  /** Lets a parent (e.g. the hover-collapsing sidebar) react to the menu opening/closing. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label={t("language.toggleLabel")}>
          {/* Shows the current language code instead of a generic icon — the
              old translate-glyph icon didn't tell anyone what it did. */}
          <span className="text-xs font-bold tracking-wide">{locale.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setLocale("de")} aria-current={locale === "de"}>
          {t("language.de")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("en")} aria-current={locale === "en"}>
          {t("language.en")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
