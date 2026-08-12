"use client";

import { FirebaseError } from "firebase/app";
import type { TranslationKey } from "@/lib/i18n/translate";

/** Maps a caught sign-in/sign-up error to a translation key for display. */
export function authErrorKey(error: unknown): TranslationKey {
  if (!(error instanceof FirebaseError)) return "auth.signInError";

  switch (error.code) {
    case "auth/email-already-in-use":
      return "auth.errorEmailInUse";
    case "auth/weak-password":
      return "auth.errorWeakPassword";
    case "auth/invalid-email":
      return "auth.errorInvalidEmail";
    // "invalid-credential" is the modern, enumeration-safe code Firebase
    // returns for both a wrong password and a missing account.
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "auth.errorInvalidCredentials";
    case "auth/too-many-requests":
      return "auth.errorTooManyRequests";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "auth.errorPopupClosed";
    default:
      return "auth.signInError";
  }
}
