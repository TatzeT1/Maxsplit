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

export function LanguageToggle({ size = "icon" }: { size?: "icon" | "icon-lg" }) {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label={t("language.toggleLabel")}>
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
