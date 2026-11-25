import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Lexend } from "next/font/google";
import { InlineScript } from "@/components/inline-script";
import { Providers } from "@/components/providers";
import { LANG_COOKIE, resolveLang } from "@/i18n";
import "./globals.css";

const lexend = Lexend({ subsets: ["latin"], weight: ["600"], variable: "--font-lexend", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PcyBox GoLive", template: "%s · PcyBox GoLive" },
  description: "The green light before any production launch. Draw your architecture, PcyBox GoLive checks everything and returns a Go / No-Go verdict.",
  icons: { icon: "/favicon-32.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

// Applies the saved theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem("golive.theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // English by default; the switch in the interface stores the choice in a cookie.
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} className={`${GeistSans.variable} ${GeistMono.variable} ${lexend.variable}`} suppressHydrationWarning>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body suppressHydrationWarning>
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
