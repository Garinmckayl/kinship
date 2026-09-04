"use client";
import Link from "next/link";
import { BorderBeam } from "border-beam";
import { AgentOrb } from "@/components/AgentOrb";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-8">
        <div className="flex justify-center">
          <div className="rounded-full bg-indigo-500/10 p-8 ring-1 ring-indigo-400/30 shadow-[0_0_120px_20px_rgba(99,102,241,0.35)]">
            <AgentOrb phase="idle" scale={3} dark />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-6xl font-black tracking-tight">💜 ElderLove</h1>
          <p className="text-2xl text-indigo-200">
            The autonomous guardian that <b>calls your parents</b> so you don't have to worry.
          </p>
          <p className="text-slate-400">
            Meds · Loneliness · Memory · Doctor escalation — Strands agent + human voice · Everyday Agents track
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
          <BorderBeam size="md" colorVariant="ocean" theme="dark">
            <Link href="/elder" className="block px-10 py-5 rounded-2xl bg-indigo-600 text-white text-2xl font-bold">
              👵 Answer as Ruth
            </Link>
          </BorderBeam>
          <BorderBeam size="md" colorVariant="sunset" theme="dark">
            <Link href="/family" className="block px-10 py-5 rounded-2xl bg-white text-slate-950 text-2xl font-bold">
              👨‍👩‍👧 Family view
            </Link>
          </BorderBeam>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 pt-6 text-left">
          {[
            ["📞", "Calls her", "Morning voice check-in. She just answers — no apps, no passwords."],
            ["💊", "Meds logged", "Confirms every pill. Nudges gently, escalates only when it matters."],
            ["💜", "Never alone", "Notices loneliness, shares memories, alerts family with context."],
          ].map(([e, t, d]) => (
            <div key={t} className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
              <p className="text-3xl">{e}</p>
              <p className="font-bold text-xl mt-2">{t}</p>
              <p className="text-slate-300 mt-1">{d}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-sm pt-4">Demo persona: Ruth, 78, lives alone, 3 meds · Single codebase: Next.js PWA + Strands TS SDK</p>
      </div>
    </main>
  );
}
