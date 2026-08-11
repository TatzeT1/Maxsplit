"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { updateDisplayName } from "@/lib/actions/profile";

export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const [name, setName] = useState(displayName);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error" | "invalid">("idle");
  const router = useRouter();
  const t = useT();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setStatus("invalid");
      return;
    }
    setLoading(true);
    setStatus("idle");
    const result = await updateDisplayName({ displayName: name });
    setLoading(false);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setStatus("success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-email">{t("profile.emailLabel")}</Label>
        <Input id="profile-email" value={email} disabled />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-display-name">{t("profile.displayNameLabel")}</Label>
        <Input
          id="profile-display-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setStatus("idle");
          }}
          placeholder={t("profile.displayNamePlaceholder")}
          maxLength={60}
          autoComplete="name"
        />
        <p className="text-muted-foreground text-sm">{t("profile.displayNameHint")}</p>
      </div>
      {status === "invalid" && (
        <p className="text-destructive text-sm">{t("profile.errorInvalidName")}</p>
      )}
      {status === "error" && <p className="text-destructive text-sm">{t("profile.saveError")}</p>}
      {status === "success" && (
        <p className="text-muted-foreground text-sm">{t("profile.saveSuccess")}</p>
      )}
      <Button type="submit" disabled={loading || !name.trim()}>
        {loading ? t("common.loading") : t("profile.save")}
      </Button>
    </form>
  );
}
