import type { Metadata, Viewport } from "next";
import { Anton, Outfit } from "next/font/google";
import Script from "next/script";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StreakWrapped — Habit Tracker",
  description:
    "Build habits, keep streaks, and replay your progress as a Wrapped story.",
  applicationName: "StreakWrapped",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Streaks",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "StreakWrapped",
    description: "Build habits, keep streaks, replay your year.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Lets the app paint under the notch and home indicator.
  viewportFit: "cover",
  // Zoom stays available — disabling it would fail WCAG 1.4.4.
  maximumScale: 5,
};

/**
 * Chromium fires `beforeinstallprompt` during the first navigation, often
 * before React hydrates. Capturing it here means the "Add to Home Screen"
 * button is live on the very first paint.
 */
const CAPTURE_INSTALL_PROMPT = `
(function () {
  window.__deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    window.dispatchEvent(new Event('installpromptready'));
  });
  window.addEventListener('appinstalled', function () {
    window.__deferredInstallPrompt = null;
    window.__appInstalled = true;
    window.dispatchEvent(new Event('installcompleted'));
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${anton.variable} ${outfit.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>
        <Script id="capture-install-prompt" strategy="beforeInteractive">
          {CAPTURE_INSTALL_PROMPT}
        </Script>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
