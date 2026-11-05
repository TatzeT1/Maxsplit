"use client";

import { ChevronRight, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { STYLE_COPY, StylePickerDialog } from "@/components/style-picker-dialog";
import { useTheme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStyle } from "@/lib/app-style";
import { isTextSize, setTextSize, useTextSize } from "@/lib/text-size";

/**
 * Appearance menu: light/dark/system, the text size (stays open while you
 * pick, so you see the effect), and a "Styles" entry that opens
 * the style gallery (style-picker-dialog.tsx) with a preview of every style.
 */
export function ThemeToggle({
  size = "icon",
  onOpenChange,
}: {
  size?: "icon" | "icon-lg";
  onOpenChange?: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const style = useAppStyle();
  const textSize = useTextSize();
  const t = useT();
  const [stylesOpen, setStylesOpen] = useState(false);

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={size} aria-label={t("theme.toggleLabel")}>
            <Sun className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-56"
          // The gallery takes focus as it opens; handing it back to the
          // trigger here would pull it out of the dialog again.
          onCloseAutoFocus={(event) => {
            if (stylesOpen) event.preventDefault();
          }}
        >
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
          <DropdownMenuLabel>{t("theme.textSizeLabel")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={textSize}
            onValueChange={(value) => {
              if (isTextSize(value)) setTextSize(value);
            }}
          >
            <DropdownMenuRadioItem value="normal" onSelect={(event) => event.preventDefault()}>
              {t("theme.textSizeNormal")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="large" onSelect={(event) => event.preventDefault()}>
              <span className="text-[1.1em]">{t("theme.textSizeLarge")}</span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="xlarge" onSelect={(event) => event.preventDefault()}>
              <span className="text-[1.2em]">{t("theme.textSizeXLarge")}</span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="py-2" onSelect={() => setStylesOpen(true)}>
            <span className="style-swatch" data-swatch={style} aria-hidden="true" />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{t("theme.stylesButton")}</span>
              <span className="text-muted-foreground text-xs">
                {t("theme.stylesCurrent", { name: t(STYLE_COPY[style].name) })}
              </span>
            </span>
            <ChevronRight className="text-muted-foreground" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StylePickerDialog open={stylesOpen} onOpenChange={setStylesOpen} />
    </>
  );
}
