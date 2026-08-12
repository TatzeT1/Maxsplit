import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

const SESSION_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000; // 5 days, Firebase's max is 14 days.

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  let decoded;
  try {
    // checkRevoked=true also rejects a disabled account, not just a revoked
    // token — without it, a banned user with a still-live cached ID token
    // could mint themselves a fresh session cookie and undo the ban.
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "Invalid idToken" }, { status: 401 });
  }

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_IN_MS,
  });

  const userRef = adminDb.doc(`users/${decoded.uid}`);
  const snapshot = await userRef.get();
  // displayName is intentionally excluded from the merge on existing docs: once
  // set, it's owned by the user (see updateDisplayName in lib/actions/profile.ts)
  // and must not be clobbered back to the Google account name on every login.
  const profile = { email: decoded.email ?? "", photoURL: decoded.picture ?? "" };
  if (snapshot.exists) {
    await userRef.set(profile, { merge: true });
  } else {
    await userRef.set({
      ...profile,
      displayName: decoded.name ?? "",
      defaultCurrency: "EUR",
      createdAt: new Date().toISOString(),
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRES_IN_MS / 1000,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
