"use client";

import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorKey } from "@/lib/firebase/auth-error";
import { auth } from "@/lib/firebase/client";
import { createServerSession } from "@/lib/firebase/complete-sign-in";
import type { TranslationKey } from "@/lib/i18n/translate";

type Mode = "signIn" | "signUp" | "reset";

export function EmailAuthForm({ redirectTo = "/groups" }: { redirectTo?: string }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const t = useT();

  function switchMode(next: Mode) {
    setMode(next);
    setErrorKey(null);
    setResetSent(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorKey(null);
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
        return;
      }

      const credential =
        mode === "signUp"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);

      if (mode === "signUp" && name.trim()) {
        await updateProfile(credential.user, { displayName: name.trim() });
      }
      // Force a refresh on sign-up so the ID token's `name` claim reflects
      // the updateProfile call above — the session route reads it to seed
      // the Firestore profile doc on first login.
      const idToken = await credential.user.getIdToken(mode === "signUp");
      const ok = await createServerSession(idToken);
      if (!ok) throw new Error("Session creation failed");
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      setErrorKey(authErrorKey(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      {mode === "signUp" && (
        <div className="flex flex-col gap-1.5 text-left">
          <Label htmlFor="auth-name">{t("auth.nameLabel")}</Label>
          <Input
            id="auth-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("auth.namePlaceholder")}
            autoComplete="name"
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5 text-left">
        <Label htmlFor="auth-email">{t("auth.emailLabel")}</Label>
        <Input
          id="auth-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
      </div>
      {mode !== "reset" && (
        <div className="flex flex-col gap-1.5 text-left">
          <Label htmlFor="auth-password">{t("auth.passwordLabel")}</Label>
          <Input
            id="auth-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          />
        </div>
      )}

      {mode === "reset" && resetSent ? (
        <p className="text-muted-foreground text-sm">{t("auth.resetPasswordSent")}</p>
      ) : (
        <Button type="submit" disabled={loading} size="lg" className="w-full gap-2.5">
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("auth.signingIn")}
            </>
          ) : (
            t(
              mode === "signUp"
                ? "auth.createAccount"
                : mode === "reset"
                  ? "auth.sendResetLink"
                  : "auth.signInButton",
            )
          )}
        </Button>
      )}

      {errorKey && <p className="animate-pop-in text-destructive text-sm">{t(errorKey)}</p>}

      <div className="flex flex-col items-center gap-1 text-xs">
        {mode === "signIn" && (
          <>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => switchMode("signUp")}
            >
              {t("auth.switchToSignUp")}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => switchMode("reset")}
            >
              {t("auth.forgotPassword")}
            </button>
          </>
        )}
        {mode !== "signIn" && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            onClick={() => switchMode("signIn")}
          >
            {t("auth.switchToSignIn")}
          </button>
        )}
      </div>
    </form>
  );
}
