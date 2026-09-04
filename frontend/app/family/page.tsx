"use client";
import { useEffect, useState } from "react";

const API = "/api";

type Status = {
  elder: string;
  adherence_today: string;
  mood: string;
  last_checkin: string;
  escalations: { level: string; message: string; time: string }[];
  memories: { title: string; note: string }[];
};

const FALLBACK: Status = {
  elder: "Ruth, 78",
  adherence_today: "2 / 3 taken",
  mood: "a little lonely",
  last_checkin: "9:02 AM",
  escalations: [{ level: "info", message: "Morning Lisinopril confirmed.", time: "9:02 AM" }],
  memories: [{ title: "1959 wedding photo", note: "Ruth smiled recalling dancing with Henry." }],
};

export default function FamilyPage() {
  const [s, setS] = useState<Status>(FALLBACK);

  useEffect(() => {
    fetch(`${API}/status?user_id=ruth-78`).then((r) => r.json()).then(setS).catch(() => {});
    const t = setInterval(() => {
      fetch(`${API}/status?user_id=ruth-78`).then((r) => r.json()).then(setS).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">👨‍👩‍👧 Family Dashboard</h1>
        <p className="text-slate-600">Quiet monitoring — we only ping you when it matters. No action needed right now ✅</p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow"><p className="text-sm text-slate-500">Adherence today</p><p className="text-2xl font-bold">{s.adherence_today}</p></div>
        <div className="bg-white rounded-2xl p-5 shadow"><p className="text-sm text-slate-500">Mood</p><p className="text-2xl font-bold">{s.mood}</p></div>
        <div className="bg-white rounded-2xl p-5 shadow"><p className="text-sm text-slate-500">Last check-in</p><p className="text-2xl font-bold">{s.last_checkin}</p></div>
      </div>

      <section className="bg-white rounded-2xl p-5 shadow">
        <h2 className="font-bold text-xl mb-3">🚨 Escalations</h2>
        <div className="space-y-2">
          {s.escalations.map((e, i) => (
            <div key={i} className={`rounded-xl p-3 ${e.level === "urgent" ? "bg-red-100 border border-red-400" : "bg-slate-100"}`}>
              <span className="text-xs font-bold uppercase">[{e.level}] {e.time}</span>
              <p>{e.message}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-5 shadow">
        <h2 className="font-bold text-xl mb-3">💜 Memory moments</h2>
        {s.memories.map((m, i) => (
          <p key={i} className="bg-indigo-50 rounded-xl p-3 mb-2"><b>{m.title}:</b> {m.note}</p>
        ))}
      </section>
    </main>
  );
}
