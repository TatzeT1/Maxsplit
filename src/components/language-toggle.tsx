"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/components/locale-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("language.toggleLabel")}>
          <Languages className="size-5" />
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
