"use client";

import { useT } from "@/components/locale-provider";
import { avatarGradient, cn } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

const MAX_VISIBLE_AVATARS = 4;

/** Overlapping initial chips for a group's members, with a "+N" chip past the first four. */
export function MemberAvatarStack({
  members,
  className,
}: {
  members: Record<string, GroupMember>;
  className?: string;
}) {
  const t = useT();
  const entries = Object.values(members);
  const visible = entries.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = entries.length - visible.length;

  return (
    <div aria-hidden="true" className={cn("flex -space-x-2", className)}>
      {visible.map((member, index) => (
        <div
          key={`${member.displayName}-${index}`}
          className={`ring-card bg-linear-to-br ${avatarGradient(member.displayName)} flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2`}
        >
          {member.displayName.charAt(0).toUpperCase() || "?"}
        </div>
      ))}
      {overflow > 0 && (
        <div className="ring-card bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2">
          {t("groups.moreMembers", { count: overflow })}
        </div>
      )}
    </div>
  );
}
