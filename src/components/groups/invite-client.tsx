"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { joinGroupByInviteCode, previewGroupByInviteCode } from "@/lib/actions/groups";
import { cn } from "@/lib/utils";

interface Preview {
  groupId: string;
  groupName: string;
  placeholders: { id: string; displayName: string }[];
}

type Status = "loading" | "claim" | "joining" | "error";

export function InviteClient({
  code,
  groupName,
  signedIn,
}: {
  code: string;
  groupName: string;
  signedIn: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;

    (async () => {
      const result = await previewGroupByInviteCode({ inviteCode: code });
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        return;
      }
      if (result.data.placeholders.length === 0) {
        const joinResult = await joinGroupByInviteCode({ inviteCode: code });
        if (cancelled) return;
        if (!joinResult.ok) {
          setStatus("error");
          return;
        }
        router.push(`/groups/${joinResult.data.groupId}`);
        return;
      }
      setPreview(result.data);
      setStatus("claim");
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, code, router]);

  async function handleClaimSubmit() {
    if (!preview) return;
    setStatus("joining");
    const result = await joinGroupByInviteCode({
      inviteCode: code,
      claimPlaceholderId: claimId ?? undefined,
    });
    if (!result.ok) {
      setStatus("error");
      return;
    }
    router.push(`/groups/${result.data.groupId}`);
  }

  if (!signedIn) {
    return (
      <div className="animate-rise flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground text-sm">{t("invite.subtitle", { name: groupName })}</p>
        <SignInButton redirectTo={`/invite/${code}`} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="animate-rise flex flex-col items-center gap-3 text-center">
        <p className="text-destructive text-sm">{t("invite.joinError")}</p>
        <Button variant="outline" onClick={() => router.push("/groups")}>
          {t("invite.goToGroups")}
        </Button>
      </div>
    );
  }

  if (status === "loading" || status === "joining" || !preview) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">{t("invite.joining", { name: groupName })}</p>
      </div>
    );
  }

  return (
    <div className="animate-rise flex w-full max-w-sm flex-col gap-4 text-center">
      <div>
        <h2 className="font-heading text-lg font-semibold">{t("groups.joinStep2Title")}</h2>
        <p className="text-muted-foreground text-sm">{t("groups.joinStep2Hint")}</p>
      </div>
      <div className="flex flex-col gap-1.5 text-left">
        {preview.placeholders.map((placeholder) => (
          <button
            key={placeholder.id}
            type="button"
            onClick={() => setClaimId(placeholder.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
              claimId === placeholder.id
                ? "bg-primary text-primary-foreground border-transparent"
                : "hover:bg-accent",
            )}
          >
            {placeholder.displayName}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setClaimId(null)}
          className={cn(
            "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
            claimId === null
              ? "bg-primary text-primary-foreground border-transparent"
              : "hover:bg-accent",
          )}
        >
          {t("groups.joinAsNew")}
        </button>
      </div>
      <Button size="lg" className="w-full" onClick={handleClaimSubmit}>
        {t("groups.joinContinue")}
      </Button>
    </div>
  );
}
