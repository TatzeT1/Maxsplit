import { avatarGradient, cn } from "@/lib/utils";

/** The app's deterministic name-colored initial chip, shared by every split mini-game. */
export function GameAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-white",
        avatarGradient(name),
        className,
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}
