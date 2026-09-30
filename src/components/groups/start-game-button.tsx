"use client";

import { Gamepad2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import type { Group } from "@/lib/types";

// The dialog pulls in the game-creation flow; load it on first tap only.
const StartGameDialog = dynamic(
  () => import("@/components/groups/start-game-dialog").then((m) => m.StartGameDialog),
  { loading: () => null },
);

/** "Spiel starten" — opens a duel without an expense behind it (see `StartGameDialog`). */
export function StartGameButton({
  groupId,
  group,
  currentUid,
  className,
}: {
  groupId: string;
  group: Group;
  currentUid: string;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Gamepad2 aria-hidden="true" />
        {t("expenses.startGame")}
      </Button>
      {mounted && (
        <StartGameDialog
          open={open}
          onOpenChange={setOpen}
          groupId={groupId}
          group={group}
          currentUid={currentUid}
        />
      )}
    </>
  );
}
