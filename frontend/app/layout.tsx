import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElderLove — Autonomous Guardian for Elders",
  description: "Proactive AI agent for medication, loneliness, memory & escalation. Built with Strands Agents SDK.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "ElderLove", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#18a98f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('elderlove-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light';document.documentElement.style.colorScheme=t==='dark'?'dark':'light'}catch(e){}})()` }} />
      </head>
      <body className="bg-slate-50 text-slate-900 min-h-screen">{children}</body>
    </html>
  );
}
