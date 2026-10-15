import { cn } from "@/lib/utils";

/**
 * A person's initial on a quiet tile — the everyday-UI avatar. Sized by the
 * caller (`size-*`, `text-*`). The split games use `GameAvatar` instead,
 * whose per-person color is how players tell each other apart on a board.
 */
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "monogram flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}
