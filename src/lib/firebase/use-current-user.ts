"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Distinguishes "auth state not resolved yet" from "confirmed signed out" —
 * collapsing both to `null` is what let a desynced client (server session
 * cookie still valid, client Firebase Auth lost — see AGENTS.md on the two
 * auth states) render as an infinite loading skeleton instead of a visible
 * error. Consumers that need to react to that desync (see SessionGuard) need
 * the distinction; plain `user` consumption is unaffected.
 */
export function useAuthState(): { user: User | null; status: AuthStatus } {
  const [state, setState] = useState<{ user: User | null; status: AuthStatus }>(() => {
    const current = auth.currentUser;
    return { user: current, status: current ? "authenticated" : "loading" };
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setState({ user, status: user ? "authenticated" : "unauthenticated" });
    });
  }, []);

  return state;
}

export function useCurrentUser(): User | null {
  return useAuthState().user;
}
