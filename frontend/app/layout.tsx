import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElderLove — Autonomous Guardian for Elders",
  description: "Proactive AI agent for medication, loneliness, memory & escalation. Built with Strands Agents SDK.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ElderLove", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#18a98f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen">{children}</body>
    </html>
  );
}
