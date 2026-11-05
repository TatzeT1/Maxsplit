"use client";

import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { EmailAuthForm, type EmailAuthMode } from "@/components/email-auth-form";
import { InAppBrowserNotice, useInAppBrowser } from "@/components/in-app-browser-notice";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/components/locale-provider";
import { authErrorKey, shouldFallBackToRedirect } from "@/lib/firebase/auth-error";
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

/** Where to go once a redirect sign-in returns — the page reloads in between. */
const REDIRECT_TARGET_KEY = "split.signInRedirectTo";

function readRedirectTarget(): string | null {
  try {
    return window.sessionStorage.getItem(REDIRECT_TARGET_KEY);
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

function writeRedirectTarget(value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(REDIRECT_TARGET_KEY);
    else window.sessionStorage.setItem(REDIRECT_TARGET_KEY, value);
  } catch {
    // Storage blocked: the redirect still signs in, it just lands on the
    // default page instead of the one that started it.
  }
}

/**
 * The whole sign-in block: a "Ich bin neu / Ich habe ein Konto" switch first,
 * so nobody has to find a small "Konto erstellen" link, then Google and email
 * under it. Inside a messenger's built-in browser Google can't sign anyone in
 * at all, so there the notice explains it and email is all that's offered.
 */
export function SignInButton({
  redirectTo = "/onboarding",
  // New people are who meets this screen: a returning user still has their
  // session cookie and never sees it. "Ich habe ein Konto" is one tap away.
  defaultMode = "signUp",
}: {
  redirectTo?: string;
  defaultMode?: EmailAuthMode;
}) {
  const [mode, setMode] = useState<EmailAuthMode>(defaultMode);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const router = useRouter();
  const t = useT();
  const inApp = useInAppBrowser();
  // A redirect sign-in is being finished (see the effect below) until it settles.
  const redirectStarted = useSyncExternalStore(
    noopSubscribe,
    () => readRedirectTarget() !== null,
    () => false,
  );
  const [redirectSettled, setRedirectSettled] = useState(false);
  const busy = loading || (redirectStarted && !redirectSettled);

  // Back from a redirect sign-in (the popup fallback below): finish it.
  useEffect(() => {
    const target = readRedirectTarget();
    if (target === null) return;
    let cancelled = false;
    (async () => {
      try {
        const credential = await getRedirectResult(auth);
        if (cancelled) return;
        writeRedirectTarget(null);
        if (!credential) {
          setRedirectSettled(true);
          return;
        }
        const ok = await createServerSession(await credential.user.getIdToken());
        if (!ok) throw new Error("Session creation failed");
        router.push(target);
        router.refresh();
      } catch (error) {
        if (cancelled) return;
        writeRedirectTarget(null);
        setErrorKey(authErrorKey(error));
        setRedirectSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleGoogle() {
    setLoading(true);
    setErrorKey(null);
    const provider = new GoogleAuthProvider();
    try {
      const credential = await signInWithPopup(auth, provider);
      const idToken = await credential.user.getIdToken();
      const ok = await createServerSession(idToken);
      if (!ok) throw new Error("Session creation failed");
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      if (shouldFallBackToRedirect(error)) {
        writeRedirectTarget(redirectTo);
        try {
          await signInWithRedirect(auth, provider);
          return; // The page navigates away.
        } catch (redirectError) {
          writeRedirectTarget(null);
          setErrorKey(authErrorKey(redirectError));
          setLoading(false);
          return;
        }
      }
      setErrorKey(authErrorKey(error));
      setLoading(false);
    }
  }

  const isNew = mode === "signUp";

  return (
    <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
      {inApp && <InAppBrowserNotice />}

      <Tabs value={mode} onValueChange={(value) => setMode(value as EmailAuthMode)}>
        <TabsList className="min-h-12">
          <TabsTrigger value="signUp" className="text-sm">
            {t("auth.tabNew")}
          </TabsTrigger>
          <TabsTrigger value="signIn" className="text-sm">
            {t("auth.tabExisting")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {!inApp && (
        <div className="flex flex-col gap-2">
          <Button onClick={handleGoogle} disabled={busy} size="lg" className="w-full gap-2.5">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("auth.signingIn")}
              </>
            ) : (
              <>
                <GoogleLogo />
                {t(isNew ? "auth.signUpWithGoogle" : "auth.signInWithGoogle")}
              </>
            )}
          </Button>
          <p className="text-muted-foreground text-center text-xs text-pretty">
            {t(isNew ? "auth.googleHintNew" : "auth.googleHintExisting")}
          </p>
          {errorKey && (
            <p className="animate-rise text-destructive text-center text-sm" role="alert">
              {t(errorKey)}
            </p>
          )}
        </div>
      )}

      {!inApp && (
        <div className="flex w-full items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-muted-foreground text-xs">{t("auth.orEmailDivider")}</span>
          <Separator className="flex-1" />
        </div>
      )}

      <EmailAuthForm
        key={mode}
        mode={mode}
        onModeChange={setMode}
        email={email}
        onEmailChange={setEmail}
        redirectTo={redirectTo}
      />
    </div>
  );
}
