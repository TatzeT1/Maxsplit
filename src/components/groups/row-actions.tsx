"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";

/**
 * The overflow menu every list row hangs its actions off.
 *
 * These lists exist to be read — what was bought, by whom, how much — and
 * editing a past entry is rare next to that. Rendering edit/duplicate/delete
 * as inline text buttons gave each of them the same visual weight as the
 * amount and cost every row an extra line, which on a phone is most of the
 * screen. One icon keeps them a single tap away without competing.
 *
 * Menu items are passed in rather than configured, because each row type has
 * a different set and some open dialogs the row itself owns.
 */
export function RowActions({ children }: { children: ReactNode }) {
  const t = useT();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.moreActions")}
          // -mr-1 lets the icon sit in the card's own padding instead of
          // stealing width from the row's text.
          className="text-muted-foreground hover:text-foreground -mr-1 shrink-0"
          // Stops the press from also hitting a clickable row wrapper.
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      {/* w-auto overrides the trigger-width default, which would size the menu
          to the icon button. */}
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
