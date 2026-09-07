"use client";
import Link from "next/link";
import { BorderBeam } from "border-beam";
import { AgentOrb } from "@/components/AgentOrb";
import { Nav } from "@/components/Nav";
import { BellIcon, HeartIcon, PhoneIcon, PillIcon } from "@/components/icons";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      <Nav />
      <div className="max-w-4xl lg:max-w-6xl mx-auto px-6 py-16 text-center space-y-8">
        <div className="flex justify-center">
          <div className="rounded-full bg-indigo-500/10 p-8 ring-1 ring-indigo-400/30 shadow-[0_0_120px_20px_rgba(99,102,241,0.35)]">
            <AgentOrb phase="idle" scale={3} dark />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-6xl font-black tracking-tight flex items-center justify-center gap-3">
            ElderLove <HeartIcon className="w-12 h-12 text-rose-400" />
          </h1>
          <p className="text-2xl text-indigo-200">
            The autonomous guardian that <b>calls your parents</b> so you don't have to worry.
          </p>
          <p className="text-slate-400">
            Meds · Loneliness · Memory · Doctor escalation — Strands agent + human voice · Everyday Agents track
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
          <BorderBeam size="md" colorVariant="ocean" theme="dark">
            <Link href="/elder" className="flex items-center gap-2 px-10 py-5 rounded-2xl bg-indigo-600 text-white text-2xl font-bold">
              <PhoneIcon className="w-7 h-7" /> Answer as Eleanor
            </Link>
          </BorderBeam>
          <BorderBeam size="md" colorVariant="sunset" theme="dark">
            <Link href="/family" className="flex items-center gap-2 px-10 py-5 rounded-2xl bg-white text-slate-950 text-2xl font-bold">
              <HeartIcon className="w-7 h-7" /> Family view
            </Link>
          </BorderBeam>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 pt-6 text-left">
          {[
            ["Calls her", "Morning voice check-in. She just answers — no apps, no passwords.", PhoneIcon],
            ["Meds logged", "Confirms every pill. Nudges gently, escalates only when it matters.", PillIcon],
            ["Never alone", "Notices loneliness, shares memories, alerts family with context.", BellIcon],
          ].map(([t, d, Icon]) => {
            const I = Icon as typeof PhoneIcon;
            return (
              <div key={t as string} className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
                <I className="w-8 h-8 text-indigo-300" />
                <p className="font-bold text-xl mt-2">{t as string}</p>
                <p className="text-slate-300 mt-1">{d as string}</p>
              </div>
            );
          })}
        </div>
        <p className="text-slate-500 text-sm pt-4">Demo persona: Eleanor, 79, lives alone, 3 meds · Single codebase: Next.js PWA + Strands TS SDK</p>
      </div>
    </main>
  );
}
