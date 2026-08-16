import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { LocaleProvider } from "@/components/locale-provider";
import { OfflineBanner } from "@/components/offline-banner";
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
    { media: "(prefers-color-scheme: light)", color: "oklch(0.98 0.012 75)" },
    { media: "(prefers-color-scheme: dark)", color: "oklch(0.19 0.028 235)" },
  ],
};

// Runs before hydration to apply the stored theme to <html> and avoid a
// flash of the wrong theme. Keep in sync with theme-provider.tsx.
const THEME_INIT_SCRIPT = `
(function() {
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <LocaleProvider initialLocale={locale}>
          <ThemeProvider>
            <OfflineBanner />
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
