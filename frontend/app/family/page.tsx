"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BorderBeam } from "border-beam";
import { AgentOrb } from "@/components/AgentOrb";
import { Markdown } from "@/components/Markdown";
import { BeamInput } from "@/components/BeamInput";
import { Tabs } from "@/components/ui";
import { Nav } from "@/components/Nav";
import { BellIcon, CheckIcon, ClockIcon, HeartIcon, LogoutIcon, PillIcon, PlusIcon, TrashIcon } from "@/components/icons";

const API = "/api";

type Status = {
  elder: string;
  adherence_today: string;
  mood: string;
  last_checkin: string;
  last_activity: { at: string; minutesAgo: number } | null;
  escalations: { id?: number; level: string; message: string; time: string; acked?: boolean }[];
  memories: { title: string; note: string }[];
};

type Med = { id: string; name: string; dosage: string; time: string; label: string; active: boolean };
type BgTask = { id: string; instruction: string; runAt: string; status: string; result?: string };
type Report = { date: string; channel: string; summary: string };
type AppointmentPreview = { status: string };

const FALLBACK: Status = {
  elder: "Eleanor, 79",
  adherence_today: "2 / 3 taken",
  mood: "a little lonely",
  last_checkin: "9:02 AM",
  last_activity: null,
  escalations: [{ level: "info", message: "Morning Lisinopril confirmed.", time: "9:02 AM" }],
  memories: [{ title: "1959 wedding photo", note: "Eleanor smiled recalling dancing with Henry." }],
};

function adherencePct(s: string) {
  const m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return 0;
  return Math.round((parseInt(m[1]) / Math.max(1, parseInt(m[2]))) * 100);
}

export default function FamilyPage() {
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authIssue, setAuthIssue] = useState(false);
  const [s, setS] = useState<Status>(FALLBACK);
  const [meds, setMeds] = useState<Med[]>([]);
  const [tasks, setTasks] = useState<BgTask[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [form, setForm] = useState({ name: "", dosage: "", time: "", label: "" });
  const [reportMsg, setReportMsg] = useState("");
  const [tab, setTab] = useState("Overview");
  const [cMsgs, setCMsgs] = useState<{ role: "cg" | "agent"; text: string }[]>([]);
  const [elderHistory, setElderHistory] = useState<{ role: string; content: string; createdAt: string }[]>([]);
  const [cInput, setCInput] = useState("");
  const cScroll = useRef<HTMLDivElement>(null);
  const cBusy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const check = async (attempt = 0) => {
      try {
        const res = await fetch(API + "/auth/me", { cache: "no-store" });
        if (res.status === 401) {
          if (!cancelled) {
            setMe(null);
            setAuthIssue(false);
            setAuthChecked(true);
          }
          return;
        }
        if (!res.ok) throw new Error("auth check failed");
        const d = await res.json();
        if (cancelled) return;
        setMe(d.user ?? null);
        setAuthIssue(false);
        setAuthChecked(true);
        if (d.user) fetch(API + "/caregiver/history", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((h) => {
          if (h?.messages?.length) setCMsgs(h.messages.map((m: { role: string; content: string }) => ({ role: m.role === "user" ? "cg" : "agent", text: m.content })));
        }).catch(() => {});
      } catch {
        if (attempt < 2) {
          window.setTimeout(() => check(attempt + 1), 350 * (attempt + 1));
          return;
        }
        if (!cancelled) {
          setAuthIssue(true);
          setAuthChecked(true);
        }
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!authChecked || !me) return;
    const load = () => {
      fetch(`${API}/status?user_id=eleanor-79`).then((r) => r.json()).then(setS).catch(() => {});
      fetch(`${API}/meds`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setMeds(d.meds ?? [])).catch(() => {});
      fetch(`${API}/tasks?user_id=eleanor-79`).then((r) => r.json()).then((d) => setTasks(d.tasks ?? [])).catch(() => {});
      fetch(`${API}/reports`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setReports(d.reports ?? [])).catch(() => {});
      fetch(API + "/appointments").then((r) => (r.ok ? r.json() : null)).then((d) => setPendingApprovals((d?.appointments ?? []).filter((a: AppointmentPreview) => a.status === "proposed").length)).catch(() => {});
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [authChecked, me]);

  useEffect(() => {
    if (!authChecked || !me) return;
    fetch(API + "/caregiver/elder-history").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.messages?.length) setElderHistory(d.messages);
    }).catch(() => {});
  }, [authChecked, me]);
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

  async function sendReportNow() {    setReportMsg("Sending…");
    const res = await fetch(`${API}/reports/generate`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setReportMsg(res.ok ? `Sent via ${d.channels?.join(", ") ?? "saved"}` : d.error ?? "Failed");
    if (res.ok) fetch(`${API}/reports`).then((r) => r.json()).then((x) => setReports(x.reports ?? [])).catch(() => {});
  }

  // A sent alert isn't a saved life — an acknowledged one is.
  async function ack(id?: number) {
    if (!id) return;
    const res = await fetch(`${API}/escalations/${id}`, { method: "PATCH" });
    if (res.ok) setS((prev) => ({ ...prev, escalations: prev.escalations.map((e) => (e.id === id ? { ...e, acked: true } : e)) }));
  }

  useEffect(() => {
    cScroll.current?.scrollTo({ top: cScroll.current.scrollHeight, behavior: "smooth" });
  }, [cMsgs, tab]);

  // Caregiver realtime chat: streaming answers from live parent data.
  async function sendC() {
    const text = cInput.trim();
    if (!text || cBusy.current) return;
    cBusy.current = true;
    setCMsgs((m) => [...m, { role: "cg", text }, { role: "agent", text: "" }]);
    setCInput("");
    const patch = (t: string) =>
      setCMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "agent", text: t };
        return c;
      });
    try {
      const res = await fetch(`${API}/caregiver/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) throw new Error("failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5));
          if (typeof ev.t === "string") {
            full += ev.t;
            patch(full);
          } else if (ev.done) {
            patch(ev.full ?? full);
          } else if (ev.error) {
            throw new Error(ev.error);
          }
        }
      }
    } catch {
      patch("Couldn't reach the assistant. Try again.");
    } finally {
      cBusy.current = false;
    }
  }

  const urgent = s.escalations.find((e) => e.level === "urgent");
  const pct = adherencePct(s.adherence_today);

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white grid place-items-center">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-teal-200/30 border-t-teal-200 animate-spin" />
          <p className="text-teal-100 font-semibold">Checking your secure caregiver session…</p>
        </div>
      </main>
    );
  }
  if (authIssue) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white grid place-items-center px-5">
        <div className="text-center space-y-4 max-w-md">
          <HeartIcon className="w-12 h-12 mx-auto text-amber-300" />
          <h1 className="text-3xl font-bold">Caregiver session unavailable</h1>
          <p className="text-slate-300">Your session was not lost. Kinship could not reach the auth service. Try again before signing in again.</p>
          <button onClick={() => window.location.reload()} className="px-6 py-3 rounded-2xl bg-teal-500 text-slate-950 font-black">Try again</button>
        </div>
      </main>
    );
  }
  if (!me) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
        <Nav />
      <div className="grid place-items-center px-5 py-20">
        <div className="text-center space-y-4 max-w-md">
          <HeartIcon className="w-12 h-12 mx-auto text-rose-400" />
          <h1 className="text-3xl font-bold">Caregiver area</h1>
          <p className="text-slate-300">Log in to manage Eleanor's medications, see reports and alerts.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/login" className="px-8 py-3 rounded-2xl bg-indigo-600 font-bold">Log in</Link>
            <Link href="/signup" className="px-8 py-3 rounded-2xl bg-white/10 ring-1 ring-white/20 font-bold">Sign up</Link>
          </div>
        </div>
      </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      <Nav />
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-5 py-8 space-y-6">
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
        <div className="flex gap-2 text-sm">
          <Link href="/calendar" className="px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/10">{pendingApprovals > 0 ? <span className="flex items-center gap-2">Decision queue <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black">{pendingApprovals}</span></span> : "Doctor calendar"}</Link>
          <Link href="/health" className="px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/10">Health</Link>
          <Link href="/elder" className="px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/10">Elder view</Link>
        </div>

        <Tabs tabs={["Overview", "Chat"]} active={tab} onChange={setTab} />

        {tab === "Overview" && pendingApprovals > 0 && (
          <div className="flex items-center gap-4 rounded-2xl bg-amber-400/10 ring-1 ring-amber-300/30 px-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-amber-300 text-slate-950 grid place-items-center font-black">{pendingApprovals}</div>
            <div className="flex-1"><p className="font-bold text-amber-100">Human decision needed</p><p className="text-sm text-amber-100/70">A proposed appointment is waiting for your approval. Kinship has not booked or synced it.</p></div>
            <Link href="/calendar" className="px-3 py-2 rounded-xl bg-amber-300 text-slate-950 text-sm font-black">Review</Link>
          </div>
        )}

        {tab === "Chat" ? (
          <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div><p className="text-xs uppercase tracking-[0.22em] text-indigo-300 font-bold">Private caregiver thread</p><p className="text-sm text-slate-400 mt-1">Conversation is saved and can be continued after a refresh.</p></div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-400/10 text-emerald-200 text-xs font-bold ring-1 ring-emerald-300/20">saved</span>
            </div>
            <div ref={cScroll} className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 mb-4">
              {cMsgs.length === 0 && (
                <p className="text-slate-400">
                  Ask anything about Eleanor — meds, mood, alerts, appointments, health.
                  Try "add Vitamin D 1000 IU at 8am" or "remind mom to drink water now".
                </p>
              )}
              {cMsgs.map((m, i) =>
                m.role === "cg" ? (
                  <div key={i} className="ml-12 bg-indigo-500 rounded-2xl p-3 text-right">{m.text}</div>
                ) : (
                  <div key={i} className="bg-slate-950/60 ring-1 ring-white/10 rounded-2xl p-3">
                    <Markdown text={m.text || "…"} />
                  </div>
                )
              )}
            </div>
            {elderHistory.length > 0 && (
              <div className="mt-5 rounded-2xl bg-teal-950/35 ring-1 ring-teal-300/20 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-teal-200 font-bold">Eleanor’s durable history</p>
                  <span className="text-xs text-teal-100/60">latest {Math.min(6, elderHistory.length)} turns</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {elderHistory.slice(-6).map((m, i) => <div key={i} className="text-sm"><span className="text-teal-200 font-bold">{m.role === "user" ? "Eleanor" : "Kinship"}</span><span className="text-slate-300"> · {m.content}</span></div>)}
                </div>
              </div>
            )}
            <BeamInput value={cInput} onChange={setCInput} onSend={sendC} onMic={() => {}} placeholder="Ask about Eleanor…" />
          </section>
        ) : (
        <>
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
            {meds.length === 0 && <p className="text-slate-400">No medications yet — add Eleanor's schedule below.</p>}
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
          <h2 className="font-bold text-xl mb-1 flex items-center gap-2"><BellIcon className="w-5 h-5" /> Alerts</h2>
          <p className="text-sm text-slate-400 mb-3">
            {s.last_activity
              ? `Last sign of Eleanor: ${s.last_activity.minutesAgo < 1 ? "just now" : `${s.last_activity.minutesAgo} min ago`}. Silence is the emergency — unconfirmed alerts re-fire.`
              : "Activity tracking starts on her next message."}
          </p>
          <div className="space-y-3">
            {s.escalations.map((e, i) => {
              const needsAck = (e.level === "urgent" || e.level === "attention") && !e.acked && e.id;
              const card = (
                <div className={`rounded-3xl p-4 ${e.level === "urgent" ? "bg-red-950/70" : e.level === "attention" ? "bg-amber-950/50" : "bg-white/5"} ring-1 ring-white/10`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${e.level === "urgent" ? "text-red-300" : e.level === "attention" ? "text-amber-300" : "text-slate-300"}`}>
                      [{e.level}] · {e.time}{e.acked ? " · confirmed" : ""}
                    </span>
                    {needsAck ? (
                      <button onClick={() => ack(e.id)}
                        className="px-3 py-1.5 rounded-xl bg-white text-slate-950 text-xs font-bold hover:bg-emerald-100">
                        I'm on it
                      </button>
                    ) : null}
                  </div>
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
          <p className="text-slate-400 text-sm mb-3">Keeps working even if Eleanor closes the app.</p>
          {tasks.length === 0 ? (
            <p className="text-slate-400">No background tasks. Eleanor can say "remind me in 30 minutes".</p>
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
        </>
        )}
      </div>
    </main>
  );
}
