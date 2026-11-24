import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Lexend } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const lexend = Lexend({ subsets: ["latin"], weight: ["600"], variable: "--font-lexend", display: "swap" });

export const metadata: Metadata = {
  title: { default: "GoLive", template: "%s · GoLive" },
  description: "Le feu vert avant toute mise en production. Dessinez votre architecture, GoLive vérifie tout et rend un verdict Go / No-Go.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable} ${lexend.variable}`} suppressHydrationWarning>
      <head>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
