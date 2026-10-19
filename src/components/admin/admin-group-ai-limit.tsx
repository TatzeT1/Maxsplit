"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSetGroupAiLimit } from "@/lib/actions/admin";
import { DEFAULT_GROUP_AI_LIMIT, MAX_GROUP_AI_LIMIT } from "@/lib/ai/limits";
import { callAction } from "@/lib/call-action";
import { useOnline } from "@/lib/use-online";

type Mode = "default" | "custom" | "blocked";

function modeOf(ownLimit: number | null): Mode {
  return ownLimit === null ? "default" : ownLimit === 0 ? "blocked" : "custom";
}

/** Default (50/month), a limit of its own, or AI blocked for the group — adminSetGroupAiLimit. */
export function AdminGroupAiLimit({
  groupId,
  ownLimit,
}: {
  groupId: string;
  ownLimit: number | null;
}) {
  const router = useRouter();
  const online = useOnline();
  const [mode, setMode] = useState<Mode>(modeOf(ownLimit));
  const [custom, setCustom] = useState(
    String(ownLimit !== null && ownLimit > 0 ? ownLimit : DEFAULT_GROUP_AI_LIMIT),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customValue = Number(custom);
  const customValid =
    /^\d+$/.test(custom.trim()) && customValue >= 1 && customValue <= MAX_GROUP_AI_LIMIT;
  const limit = mode === "default" ? null : mode === "blocked" ? 0 : customValue;
  const unchanged = limit === ownLimit;

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await callAction(() => adminSetGroupAiLimit({ groupId, limit }));
    if (!result.ok) {
      setError(
        result.error === "network" ? "Not saved — no connection." : "Failed to update the limit.",
      );
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  const options: { value: Mode; label: string }[] = [
    { value: "default", label: `Default (${DEFAULT_GROUP_AI_LIMIT} / month)` },
    { value: "custom", label: "Own limit" },
    { value: "blocked", label: "Blocked — no AI" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="sr-only">AI limit</legend>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`ai-limit-${groupId}`}
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {mode === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_GROUP_AI_LIMIT}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="w-28"
            aria-label="Prompts per month"
            disabled={busy}
          />
          <span className="text-muted-foreground text-sm">prompts / month</span>
        </div>
      )}
      <Button
        size="sm"
        className="w-fit"
        disabled={busy || !online || unchanged || (mode === "custom" && !customValid)}
        onClick={handleSave}
      >
        Save limit
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
