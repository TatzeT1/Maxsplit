"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { auth } from "@/lib/firebase/client";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useT();

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(auth);
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={loading}>
      {t("nav.signOut")}
    </Button>
  );
}
