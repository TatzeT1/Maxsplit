import type { NextConfig } from "next";
import { assertFirebaseClientEnvFormat } from "./src/lib/firebase/config";

// Fail the build on a malformed NEXT_PUBLIC_FIREBASE_* value rather than
// inlining it into the client bundle. These are baked in at build time, so a
// bad value ships as a broken deployment that looks healthy: production once
// ran with the storage bucket in NEXT_PUBLIC_FIREBASE_PROJECT_ID, which left
// Auth working while every Firestore read was denied. A red build with the
// offending variable named is the cheapest possible place to catch that.
assertFirebaseClientEnvFormat();

// Baseline security headers applied to every route. Deliberately excludes a
// Content-Security-Policy: a strict CSP has to be tuned against the running app
// (Firebase Auth/Firestore origins, Next's inline bootstrap script, styling)
// and shipping a wrong one silently breaks auth — it's tracked as follow-up
// rather than guessed at here. HSTS is safe because the app is HTTPS-only on
// Vercel; the long max-age + preload opts the apex domain into the preload list.
const securityHeaders = [
  // Clickjacking: the app performs money actions from a session cookie, and the
  // /share/settlement PDF is meant to open directly, never inside a frame.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // No route needs the camera, mic, or geolocation — deny them outright.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Holds a Server Action (or navigation/prefetch) pending instead of
    // throwing when the network drops, and retries it once connectivity
    // returns — see node_modules/next/dist/docs/01-app/02-guides/offline-support.md.
    // Only covers the current page session; a closed tab or a killed iOS PWA
    // still loses the pending write, which is what the IndexedDB outbox in
    // src/lib/offline is for (see OfflineBanner / action-queue.ts).
    useOffline: true,
  },
  async headers() {
    return [
      {
        // Firebase Auth's signInWithPopup needs to poll window.closed on the
        // popup from the opener tab. A strict same-origin COOP (Vercel's
        // platform default) silently blocks that check, so onAuthStateChanged
        // never fires and the client SDK never learns sign-in succeeded even
        // though the server session cookie was set correctly.
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
