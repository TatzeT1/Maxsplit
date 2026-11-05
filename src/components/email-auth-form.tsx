"use client";

import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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

export type EmailAuthMode = "signIn" | "signUp";

const linkClass =
  "text-muted-foreground hover:text-foreground text-sm underline underline-offset-2 py-1";

/**
 * Email/password sign-in and sign-up. The mode is owned by the parent's
 * "Ich bin neu / Ich habe ein Konto" switch — a first-timer must never land
 * on the sign-in form by default and read "E-Mail oder Passwort ist falsch"
 * for an account that doesn't exist yet. When that happens anyway, the error
 * offers the way out as a button, keeping the typed email.
 */
export function EmailAuthForm({
  mode,
  onModeChange,
  email,
  onEmailChange,
  redirectTo = "/groups",
}: {
  mode: EmailAuthMode;
  onModeChange: (mode: EmailAuthMode) => void;
  email: string;
  onEmailChange: (email: string) => void;
  redirectTo?: string;
}) {
  const [resetting, setResetting] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const t = useT();

  function switchMode(next: EmailAuthMode) {
    setErrorKey(null);
    setResetting(false);
    setResetSent(false);
    onModeChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorKey(null);
    try {
      if (resetting) {
        await sendPasswordResetEmail(auth, email.trim());
        setResetSent(true);
        return;
      }

      const credential =
        mode === "signUp"
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);

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

  const submitLabel: TranslationKey = resetting
    ? "auth.sendResetLink"
    : mode === "signUp"
      ? "auth.createAccount"
      : "auth.signInButton";

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3.5">
      {mode === "signUp" && !resetting && (
        <div className="flex flex-col gap-1.5 text-left">
          <Label htmlFor="auth-name">{t("auth.nameLabel")}</Label>
          <Input
            id="auth-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("auth.namePlaceholder")}
            autoComplete="name"
            autoCapitalize="words"
            aria-describedby="auth-name-hint"
          />
          <p id="auth-name-hint" className="text-muted-foreground text-xs">
            {t("auth.nameHint")}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5 text-left">
        <Label htmlFor="auth-email">{t("auth.emailLabel")}</Label>
        <Input
          id="auth-email"
          type="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      {!resetting && (
        <div className="flex flex-col gap-1.5 text-left">
          <Label htmlFor="auth-password">{t("auth.passwordLabel")}</Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="pr-11"
              aria-describedby={mode === "signUp" ? "auth-password-hint" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
              aria-pressed={showPassword}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {mode === "signUp" && (
            <p id="auth-password-hint" className="text-muted-foreground text-xs">
              {t("auth.passwordHintNew")}
            </p>
          )}
        </div>
      )}

      {resetting && resetSent ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t("auth.resetPasswordSent")}
        </p>
      ) : (
        <Button type="submit" disabled={loading} size="lg" className="w-full gap-2.5">
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("auth.signingIn")}
            </>
          ) : (
            t(submitLabel)
          )}
        </Button>
      )}

      {errorKey && (
        <div className="animate-rise flex flex-col items-center gap-2" role="alert">
          <p className="text-destructive text-sm">{t(errorKey)}</p>
          {errorKey === "auth.errorInvalidCredentials" && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode("signUp")}
            >
              {t("auth.noAccountYet")}
            </Button>
          )}
          {errorKey === "auth.errorEmailInUse" && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode("signIn")}
            >
              {t("auth.signInInstead")}
            </Button>
          )}
        </div>
      )}

      {mode === "signIn" && (
        <div className="flex flex-col items-center">
          {resetting ? (
            <button
              type="button"
              className={linkClass}
              onClick={() => {
                setResetting(false);
                setResetSent(false);
                setErrorKey(null);
              }}
            >
              {t("common.back")}
            </button>
          ) : (
            <button
              type="button"
              className={linkClass}
              onClick={() => {
                setResetting(true);
                setErrorKey(null);
              }}
            >
              {t("auth.forgotPassword")}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
