"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmailAuthForm } from "@/components/email-auth-form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/components/locale-provider";
import { authErrorKey } from "@/lib/firebase/auth-error";
import { auth } from "@/lib/firebase/client";
import { createServerSession } from "@/lib/firebase/complete-sign-in";
import type { TranslationKey } from "@/lib/i18n/translate";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4c-7.5 0-13.9 4.2-17.2 10.4z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.1 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.9 39.6 16.4 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.5 36 44 30.5 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export function SignInButton({ redirectTo = "/groups" }: { redirectTo?: string }) {
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const router = useRouter();
  const t = useT();

  async function handleSignIn() {
    setLoading(true);
    setErrorKey(null);
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = await credential.user.getIdToken();
      const ok = await createServerSession(idToken);
      if (!ok) throw new Error("Session creation failed");
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      setErrorKey(authErrorKey(error));
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <Button onClick={handleSignIn} disabled={loading} size="lg" className="w-full gap-2.5">
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("auth.signingIn")}
          </>
        ) : (
          <>
            <GoogleLogo />
            {t("auth.signInWithGoogle")}
          </>
        )}
      </Button>
      {errorKey && <p className="animate-rise text-destructive text-sm">{t(errorKey)}</p>}

      {showEmail ? (
        <EmailAuthForm redirectTo={redirectTo} />
      ) : (
        <>
          <div className="flex w-full items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">{t("auth.orDivider")}</span>
            <Separator className="flex-1" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowEmail(true)}>
            {t("auth.continueWithEmail")}
          </Button>
        </>
      )}
    </div>
  );
}
