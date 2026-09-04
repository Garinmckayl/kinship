"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BorderBeam } from "border-beam";
import { AgentOrb } from "@/components/AgentOrb";
import { BellIcon, CheckIcon, ClockIcon, HeartIcon, LogoutIcon, PillIcon, PlusIcon, TrashIcon } from "@/components/icons";

const API = "/api";

type Status = {
  elder: string;
  adherence_today: string;
  mood: string;
  last_checkin: string;
  escalations: { level: string; message: string; time: string }[];
  memories: { title: string; note: string }[];
};

type Med = { id: string; name: string; dosage: string; time: string; label: string; active: boolean };
type BgTask = { id: string; instruction: string; runAt: string; status: string; result?: string };
type Report = { date: string; channel: string; summary: string };

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
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [s, setS] = useState<Status>(FALLBACK);
  const [meds, setMeds] = useState<Med[]>([]);
  const [tasks, setTasks] = useState<BgTask[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [form, setForm] = useState({ name: "", dosage: "", time: "", label: "" });
  const [reportMsg, setReportMsg] = useState("");

  useEffect(() => {
    fetch(`${API}/auth/me`).then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user ?? null)).catch(() => {}).finally(() => setAuthChecked(true));
    const load = () => {
      fetch(`${API}/status?user_id=ruth-78`).then((r) => r.json()).then(setS).catch(() => {});
      fetch(`${API}/meds`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setMeds(d.meds ?? [])).catch(() => {});
      fetch(`${API}/tasks?user_id=ruth-78`).then((r) => r.json()).then((d) => setTasks(d.tasks ?? [])).catch(() => {});
      fetch(`${API}/reports`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setReports(d.reports ?? [])).catch(() => {});
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  async function logout() {
    await fetch(`${API}/auth/logout`, { method: "POST" });
    setMe(null);
  }

  async function addMed() {
    if (!form.name || !form.time) return;
    const res = await fetch(`${API}/meds`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      const d = await res.json();
      setMeds((m) => [...m, d.med].sort((a, b) => a.time.localeCompare(b.time)));
      setForm({ name: "", dosage: "", time: "", label: "" });
    }
  }

  async function toggleMed(m: Med) {
    const res = await fetch(`${API}/meds/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !m.active }) });
    if (res.ok) setMeds((ms) => ms.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)));
  }

  async function delMed(id: string) {
    const res = await fetch(`${API}/meds/${id}`, { method: "DELETE" });
    if (res.ok) setMeds((ms) => ms.filter((x) => x.id !== id));
  }

  async function sendReportNow() {
    setReportMsg("Sending…");
    const res = await fetch(`${API}/reports/generate`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setReportMsg(res.ok ? `Sent via ${d.channels?.join(", ") ?? "saved"}` : d.error ?? "Failed");
    if (res.ok) fetch(`${API}/reports`).then((r) => r.json()).then((x) => setReports(x.reports ?? [])).catch(() => {});
  }

  const urgent = s.escalations.find((e) => e.level === "urgent");
  const pct = adherencePct(s.adherence_today);

  if (authChecked && !me) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white grid place-items-center px-5">
        <div className="text-center space-y-4 max-w-md">
          <HeartIcon className="w-12 h-12 mx-auto text-rose-400" />
          <h1 className="text-3xl font-bold">Caregiver area</h1>
          <p className="text-slate-300">Log in to manage Ruth's medications, see reports and alerts.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/login" className="px-8 py-3 rounded-2xl bg-indigo-600 font-bold">Log in</Link>
            <Link href="/signup" className="px-8 py-3 rounded-2xl bg-white/10 ring-1 ring-white/20 font-bold">Sign up</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      <div className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        <header className="flex items-center gap-4">
          <AgentOrb phase={urgent ? "speaking" : "idle"} scale={1} dark speed={urgent ? 1.6 : 1} />
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Family Dashboard</h1>
            <p className={urgent ? "text-red-300 font-semibold" : "text-emerald-300"}>
              {urgent ? "Attention needed — see below" : "Quiet monitoring — no action needed"}
            </p>
          </div>
          {me && (
            <button onClick={logout} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-sm" title={me.email}>
              <LogoutIcon className="w-4 h-4" /> {me.name}
            </button>
          )}
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 text-center">
            <div className="mx-auto w-20 h-20 rounded-full grid place-items-center font-bold text-lg"
              style={{ background: `conic-gradient(#34d399 ${pct * 3.6}deg, rgba(255,255,255,0.1) 0deg)` }}>
              <div className="w-14 h-14 rounded-full bg-[#14123a] grid place-items-center">{pct}%</div>
            </div>
            <p className="text-sm text-slate-300 mt-2">Adherence</p>
            <p className="font-bold">{s.adherence_today}</p>
          </div>
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 text-center flex flex-col justify-center">
            <HeartIcon className="w-8 h-8 mx-auto text-rose-400" />
            <p className="text-sm text-slate-300 mt-2">Mood</p>
            <p className="font-bold capitalize">{s.mood}</p>
          </div>
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 text-center flex flex-col justify-center">
            <ClockIcon className="w-8 h-8 mx-auto text-indigo-300" />
            <p className="text-sm text-slate-300 mt-2">Last check-in</p>
            <p className="font-bold">{s.last_checkin}</p>
          </div>
        </div>

        {/* Medication management */}
        <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
          <h2 className="font-bold text-xl mb-3 flex items-center gap-2"><PillIcon className="w-5 h-5" /> Medications</h2>
          <div className="space-y-2 mb-4">
            {meds.length === 0 && <p className="text-slate-400">No medications yet — add Ruth's schedule below.</p>}
            {meds.map((m) => (
              <div key={m.id} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ring-white/10 ${m.active ? "bg-slate-950/60" : "bg-slate-950/30 opacity-50"}`}>
                <button onClick={() => toggleMed(m)} title={m.active ? "Pause" : "Resume"}
                  className={`w-9 h-9 rounded-full grid place-items-center ${m.active ? "bg-emerald-500" : "bg-slate-600"}`}>
                  <CheckIcon className="w-5 h-5" />
                </button>
                <div className="flex-1">
                  <p className="font-bold">{m.name} <span className="font-normal text-slate-300">{m.dosage}</span></p>
                  <p className="text-sm text-slate-400">{m.time} · {m.label}</p>
                </div>
                <button onClick={() => delMed(m.id)} className="p-2 text-slate-400 hover:text-red-300" title="Remove">
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name"
              className="bg-white/5 ring-1 ring-white/10 rounded-xl px-3 py-2 outline-none placeholder:text-slate-500" />
            <input value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="Dose"
              className="bg-white/5 ring-1 ring-white/10 rounded-xl px-3 py-2 outline-none placeholder:text-slate-500" />
            <input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="09:00" type="time"
              className="bg-white/5 ring-1 ring-white/10 rounded-xl px-3 py-2 outline-none" />
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label"
              className="bg-white/5 ring-1 ring-white/10 rounded-xl px-3 py-2 outline-none placeholder:text-slate-500" />
            <button onClick={addMed} className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold">
              <PlusIcon className="w-5 h-5" /> Add
            </button>
          </div>
        </section>

        {/* Escalations */}
        <section>
          <h2 className="font-bold text-xl mb-3 flex items-center gap-2"><BellIcon className="w-5 h-5" /> Alerts</h2>
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
          <h2 className="font-bold text-xl mb-1">Background agent</h2>
          <p className="text-slate-400 text-sm mb-3">Keeps working even if Ruth closes the app.</p>
          {tasks.length === 0 ? (
            <p className="text-slate-400">No background tasks. Ruth can say "remind me in 30 minutes".</p>
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

        {/* Daily reports */}
        <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-xl">Daily reports</h2>
            <button onClick={sendReportNow} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold">
              Send now
            </button>
          </div>
          {reportMsg && <p className="text-sm text-slate-300 mb-2">{reportMsg}</p>}
          {reports.length === 0 ? (
            <p className="text-slate-400 text-sm">No reports yet. Auto-sent every evening via WhatsApp + email.</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r, i) => (
                <details key={i} className="bg-slate-950/60 ring-1 ring-white/10 rounded-2xl p-3">
                  <summary className="cursor-pointer font-semibold">{r.date} · {r.channel}</summary>
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap mt-2">{r.summary}</pre>
                </details>
              ))}
            </div>
          )}
        </section>

        {/* Memories */}
        <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
          <h2 className="font-bold text-xl mb-3 flex items-center gap-2"><HeartIcon className="w-5 h-5" /> Memory moments</h2>
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
