"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/types";

/**
 * "Einladungslink teilen" that actually shares: on phones the native share
 * sheet, so the link goes straight into the group chat it's meant for.
 * Where there's no share sheet (most desktops) it copies instead, and says
 * so. Cancelling the sheet is a choice, not an error, and stays silent.
 */
export function InviteShareButton({
  group,
  className,
  variant = "default",
}: {
  group: Group;
  className?: string;
  variant?: "default" | "secondary" | "outline";
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/invite/${group.inviteCode}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: group.name,
          text: t("groups.inviteShareText", { name: group.name }),
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Anything else (no permission, unsupported payload): copy instead.
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={cn(
        "h-11",
        copied && "border-success/40 bg-success/10 text-success hover:bg-success/10",
        className,
      )}
      onClick={handleShare}
    >
      {copied ? <Check /> : <Share2 />}
      {copied ? t("groups.inviteCodeCopied") : t("groups.shareInvite")}
    </Button>
  );
}
