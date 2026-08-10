import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Wraps a native <select> instead of a Radix listbox — the OS-native picker
 * is the better mobile experience (wheel/sheet picker, no custom touch
 * targets to get right). Needs bg/text to be explicit (not just inherited)
 * and `color-scheme` set per theme in globals.css, or the native dropdown
 * popup renders with the wrong-theme colors and becomes unreadable.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          "border-input text-foreground focus-visible:border-ring focus-visible:ring-ring/50 bg-background [&>option]:bg-background [&>option]:text-foreground h-10 w-full min-w-0 appearance-none rounded-lg border px-3 pr-9 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
    </div>
  );
}

export { Select };
