"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { auth } from "@/lib/firebase/client";

export function SignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  const t = useT();

  async function handleSignIn() {
    setLoading(true);
    setError(false);
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = await credential.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) throw new Error("Session creation failed");
      router.push("/groups");
      router.refresh();
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button onClick={handleSignIn} disabled={loading} size="lg">
        {loading ? t("auth.signingIn") : t("auth.signInWithGoogle")}
      </Button>
      {error && <p className="text-destructive text-sm">{t("auth.signInError")}</p>}
    </div>
  );
}
