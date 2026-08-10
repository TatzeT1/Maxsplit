import type { NextConfig } from "next";

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
