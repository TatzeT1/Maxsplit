import type { Metadata, Viewport } from "next";
import {
  Archivo,
  Bricolage_Grotesque,
  Fraunces,
  Geist,
  Geist_Mono,
  Hanken_Grotesk,
  Martian_Mono,
} from "next/font/google";
import Script from "next/script";
import { LocaleProvider } from "@/components/locale-provider";
import { OfflineBanner } from "@/components/offline-banner";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeProvider } from "@/components/theme-provider";
import { getLocale, getServerT } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Distinctive display serif for headings, dialog titles, and money amounts —
// deliberately different in character from the neutral body font so the
// numbers that matter most (what you owe, what you're owed) carry weight.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

// Faces for the optional styles (see lib/app-style.ts). Not preloaded: only
// the active style's CSS references them, so a device on the default style
// never downloads them.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  preload: false,
});
const martianMono = Martian_Mono({
  variable: "--font-martian",
  subsets: ["latin"],
  axes: ["wdth"],
  preload: false,
});
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  preload: false,
});
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("app.name"),
    description: t("app.tagline"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Makes the layout viewport (and `dvh` units) actually shrink when the
  // on-screen keyboard opens, instead of the keyboard just overlaying a
  // viewport that still thinks it's full height — otherwise our centered
  // dialogs can end up with their input fields hidden behind the keyboard.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "oklch(0.985 0.002 80)" },
    { media: "(prefers-color-scheme: dark)", color: "oklch(0.16 0.003 70)" },
  ],
};

// Runs before hydration to apply the stored theme and style to <html> and
// avoid a flash of the wrong look. Keep in sync with theme-provider.tsx and
// lib/app-style.ts (storage keys and the list of styles).
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var style = localStorage.getItem("style");
    if (["graphit", "original", "fallblatt", "bierdeckel", "riso"].indexOf(style) !== -1) {
      document.documentElement.setAttribute("data-style", style);
    }
  } catch (e) {}
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
    if (theme === "system") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${hankenGrotesk.variable} ${martianMono.variable} ${archivo.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <LocaleProvider initialLocale={locale}>
          <ThemeProvider>
            <OfflineBanner />
            <ServiceWorkerRegistration />
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
