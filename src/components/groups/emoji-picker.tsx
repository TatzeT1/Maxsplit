"use client";

import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/components/locale-provider";
import { EXPENSE_EMOJIS } from "@/lib/emoji";
import { cn } from "@/lib/utils";

export function ExpenseEmojiPicker({
  value,
  onChange,
  fallback,
  colorClassName,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  fallback: ReactNode;
  colorClassName: string;
}) {
  const t = useT();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("expenses.emojiPickerLabel")}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg transition-colors active:scale-95",
            colorClassName,
          )}
        >
          {value ?? fallback}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem
          onSelect={() => onChange(null)}
          className="justify-center rounded-md py-1.5 text-xs font-medium"
        >
          {t("expenses.emojiReset")}
        </DropdownMenuItem>
        <div className="grid grid-cols-6 gap-1 p-1">
          {EXPENSE_EMOJIS.map((emoji) => (
            <DropdownMenuItem
              key={emoji}
              onSelect={() => onChange(emoji)}
              className={cn(
                "h-9 w-9 items-center justify-center rounded-lg p-0 text-lg",
                value === emoji && "bg-accent",
              )}
            >
              {emoji}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
