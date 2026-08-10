import type { NextConfig } from "next";
import { assertFirebaseClientEnvFormat } from "./src/lib/firebase/config";

// Fail the build on a malformed NEXT_PUBLIC_FIREBASE_* value rather than
// inlining it into the client bundle. These are baked in at build time, so a
// bad value ships as a broken deployment that looks healthy: production once
// ran with the storage bucket in NEXT_PUBLIC_FIREBASE_PROJECT_ID, which left
// Auth working while every Firestore read was denied. A red build with the
// offending variable named is the cheapest possible place to catch that.
assertFirebaseClientEnvFormat();

const nextConfig: NextConfig = {
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
        ],
      },
    ];
  },
};

export default nextConfig;
