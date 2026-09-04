"use client";
import { useEffect, useState } from "react";
import { BorderBeam } from "border-beam";
import { AgentOrb } from "@/components/AgentOrb";

const API = "/api";

type Status = {
  elder: string;
  adherence_today: string;
  mood: string;
  last_checkin: string;
  escalations: { level: string; message: string; time: string }[];
  memories: { title: string; note: string }[];
};

type BgTask = { id: string; instruction: string; runAt: string; status: string; result?: string };

const FALLBACK: Status = {
  elder: "Ruth, 78",
  adherence_today: "2 / 3 taken",
  mood: "a little lonely",
  last_checkin: "9:02 AM",
  escalations: [{ level: "info", message: "Morning Lisinopril confirmed.", time: "9:02 AM" }],
  memories: [{ title: "1959 wedding photo", note: "Ruth smiled recalling dancing with Henry." }],
};

function adherencePct(s: string) {
  const m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return 0;
  return Math.round((parseInt(m[1]) / Math.max(1, parseInt(m[2]))) * 100);
}

export default function FamilyPage() {
  const [s, setS] = useState<Status>(FALLBACK);
  const [tasks, setTasks] = useState<BgTask[]>([]);

  useEffect(() => {
    const load = () => {
      fetch(`${API}/status?user_id=ruth-78`).then((r) => r.json()).then(setS).catch(() => {});
      fetch(`${API}/tasks?user_id=ruth-78`).then((r) => r.json()).then((d) => setTasks(d.tasks ?? [])).catch(() => {});
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const urgent = s.escalations.find((e) => e.level === "urgent");
  const pct = adherencePct(s.adherence_today);

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      <div className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        <header className="flex items-center gap-4">
          <AgentOrb phase={urgent ? "speaking" : "idle"} scale={1} dark speed={urgent ? 1.6 : 1} />
          <div>
            <h1 className="text-3xl font-bold">Family Dashboard</h1>
            <p className={urgent ? "text-red-300 font-semibold" : "text-emerald-300"}>
              {urgent ? "⚠️ Attention needed — see below" : "✅ Quiet monitoring — no action needed"}
            </p>
          </div>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 text-center">
            <div
              className="mx-auto w-20 h-20 rounded-full grid place-items-center font-bold text-lg"
              style={{ background: `conic-gradient(#34d399 ${pct * 3.6}deg, rgba(255,255,255,0.1) 0deg)` }}
            >
              <div className="w-14 h-14 rounded-full bg-[#14123a] grid place-items-center">{pct}%</div>
            </div>
            <p className="text-sm text-slate-300 mt-2">Adherence</p>
            <p className="font-bold">{s.adherence_today}</p>
          </div>
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 text-center flex flex-col justify-center">
            <p className="text-4xl">💜</p>
            <p className="text-sm text-slate-300 mt-2">Mood</p>
            <p className="font-bold capitalize">{s.mood}</p>
          </div>
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 text-center flex flex-col justify-center">
            <p className="text-4xl">🕰️</p>
            <p className="text-sm text-slate-300 mt-2">Last check-in</p>
            <p className="font-bold">{s.last_checkin}</p>
          </div>
        </div>

        {/* Escalations */}
        <section>
          <h2 className="font-bold text-xl mb-3">🚨 Escalations</h2>
          <div className="space-y-3">
            {s.escalations.map((e, i) => {
              const card = (
                <div className={`rounded-3xl p-4 ${e.level === "urgent" ? "bg-red-950/70" : e.level === "attention" ? "bg-amber-950/50" : "bg-white/5"} ring-1 ring-white/10`}>
                  <span className={`text-xs font-bold uppercase tracking-wider ${e.level === "urgent" ? "text-red-300" : e.level === "attention" ? "text-amber-300" : "text-slate-300"}`}>
                    [{e.level}] · {e.time}
                  </span>
                  <p className="mt-1 text-lg">{e.message}</p>
                </div>
              );
              return e.level === "urgent" ? (
                <BorderBeam key={i} size="md" colorVariant="sunset" theme="dark">{card}</BorderBeam>
              ) : (
                <div key={i}>{card}</div>
              );
            })}
          </div>
        </section>

        {/* Background tasks */}
        <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
          <h2 className="font-bold text-xl mb-1">⚙️ Background agent</h2>
          <p className="text-slate-400 text-sm mb-3">Keeps working even if Ruth closes the app — reminders, later check-ins, scheduled calls.</p>
          {tasks.length === 0 ? (
            <p className="text-slate-400">No background tasks. Ruth can say “remind me in 30 minutes”.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="bg-slate-950/60 ring-1 ring-white/10 rounded-2xl p-3">
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-bold uppercase tracking-wider ${t.status === "done" ? "text-emerald-300" : t.status === "failed" ? "text-red-300" : t.status === "running" ? "text-sky-300" : "text-amber-300"}`}>
                      [{t.status}]
                    </span>
                    <span className="text-xs text-slate-400">{new Date(t.runAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1">{t.instruction}</p>
                  {t.result && <p className="text-sm text-slate-400 mt-1">→ {t.result}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Memories */}
        <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
          <h2 className="font-bold text-xl mb-3">💜 Memory moments</h2>
          <div className="grid gap-2">
            {s.memories.map((m, i) => (
              <p key={i} className="bg-indigo-500/15 ring-1 ring-indigo-400/20 rounded-2xl p-3">
                <b>{m.title}:</b> {m.note}
              </p>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
