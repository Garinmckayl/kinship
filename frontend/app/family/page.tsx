"use client";
import { memo, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BorderBeam } from "border-beam";
import { AgentOrb } from "@/components/AgentOrb";
import { Markdown } from "@/components/Markdown";
import { BeamInput } from "@/components/BeamInput";
import { Tabs } from "@/components/ui";
import { Nav } from "@/components/Nav";
import { BellIcon, CheckIcon, ClockIcon, HeartIcon, LogoutIcon, PillIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { browserProofStage } from "@/lib/safety-policy";

const API = "/api";
const BrowserLiveView = dynamic(
  () => import("bedrock-agentcore/browser/live-view").then((module) => module.BrowserLiveView),
  { ssr: false },
);

const StableBrowserLiveView = memo(function StableBrowserLiveView({ signedUrl }: { signedUrl: string }) {
  return <BrowserLiveView signedUrl={signedUrl} remoteWidth={1600} remoteHeight={900} />;
});

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
type BrowserTaskPreview = {
  task_id: string;
  task_type: string;
  status: string;
  params: Record<string, unknown>;
  steps: { label: string; status: string }[];
  result: Record<string, unknown> | null;
  error: string | null;
  recording_url?: string | null;
  sidecar_task_id?: string | null;
};
type RiskSignal = { label: string; severity: string; detail: string };
type CompoundRisk = {
  riskLevel: "green" | "yellow" | "orange" | "red";
  action: string;
  totalWeight: number;
  reasoning: string;
  signals: RiskSignal[];
  escalated: boolean;
  at: string;
};

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

function mergeBrowserTaskUpdates(current: BrowserTaskPreview[], incoming: BrowserTaskPreview[]) {
  const previousById = new Map(current.map((task) => [task.task_id, task]));
  return incoming.map((task) => {
    const previous = previousById.get(task.task_id);
    if (!previous?.recording_url || task.status !== "running") return task;
    return { ...task, recording_url: previous.recording_url };
  });
}

function formatBrowserResult(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
  const [risk, setRisk] = useState<CompoundRisk | null>(null);
  const [browserTasks, setBrowserTasks] = useState<BrowserTaskPreview[]>([]);
  const [demoTaskBusy, setDemoTaskBusy] = useState(false);
  const [approvingTaskId, setApprovingTaskId] = useState<string | null>(null);
  const [clearingBrowserTasks, setClearingBrowserTasks] = useState(false);
  const [resettingJudgeDemo, setResettingJudgeDemo] = useState(false);
  const [clearingBackgroundTasks, setClearingBackgroundTasks] = useState(false);
  const [browserActionError, setBrowserActionError] = useState<string | null>(null);
  const hasRunningBrowserTask = browserTasks.some((task) => task.status === "running" || task.status === "approved");
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
      fetch(`${API}/welfare/compound`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setRisk(d)).catch(() => {});
      fetch(`${API}/browser-agent`)
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error ?? "Browser tasks are temporarily unavailable");
          return data;
        })
        .then((d) => d?.tasks && setBrowserTasks((current) => mergeBrowserTaskUpdates(current, d.tasks)))
        .catch((error) => setBrowserActionError(error instanceof Error ? error.message : "Browser tasks are temporarily unavailable"));
    };
    load();
    // Poll: fast for status (10s), browser tasks check every 3s when one is running
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [authChecked, me]);

  // Faster polling when a browser task is running
  useEffect(() => {
    if (!hasRunningBrowserTask) return;

    const poll = () => {
      fetch(`${API}/browser-agent`)
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error ?? "Nova Act progress is temporarily unavailable");
          return data;
        })
        .then((d) => d?.tasks && setBrowserTasks((current) => mergeBrowserTaskUpdates(current, d.tasks)))
        .catch((error) => setBrowserActionError(error instanceof Error ? error.message : "Nova Act progress is temporarily unavailable"));
    };

    poll();
    const t = setInterval(poll, 1000);
    return () => clearInterval(t);
  }, [hasRunningBrowserTask]);

  async function createProviderSearchDemo() {
    setDemoTaskBusy(true);
    setBrowserActionError(null);
    try {
      const response = await fetch(`${API}/browser-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_type: "provider_search",
          params: { specialty: "Internal Medicine", zip_code: "43215", max_results: 3 },
        }),
      });
      if (!response.ok) throw new Error("Could not create provider search");
      const task = await response.json();
      setBrowserTasks((current) => [task, ...current.filter((item) => item.task_id !== task.task_id)]);
    } catch (error) {
      setBrowserActionError(error instanceof Error ? error.message : "Could not create provider search");
    } finally {
      setDemoTaskBusy(false);
    }
  }

  useEffect(() => {
    if (!authChecked || !me) return;
    fetch(API + "/caregiver/elder-history").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.messages?.length) setElderHistory(d.messages);
    }).catch(() => {});
  }, [authChecked, me]);

  async function resetJudgeDemo() {
    setResettingJudgeDemo(true);
    setBrowserActionError(null);
    try {
      const response = await fetch(API + "/demo/reset", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not reset judge demo");
      setBrowserTasks(data.task ? [data.task] : []);
      window.location.reload();
    } catch (error) {
      setBrowserActionError(error instanceof Error ? error.message : "Could not reset judge demo");
    } finally {
      setResettingJudgeDemo(false);
    }
  }

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
            <p className={urgent ? "text-red-300 font-semibold" : risk && risk.riskLevel !== "green" ? (risk.riskLevel === "red" ? "text-red-300 font-semibold" : "text-amber-300 font-semibold") : "text-emerald-300"}>
              {urgent ? "Attention needed — see below" : risk && risk.riskLevel === "red" ? "Compound risk detected — review signals below" : risk && risk.riskLevel !== "green" ? "Elevated signals — monitoring" : "Quiet monitoring — no action needed"}
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

        {tab === "Overview" && risk && risk.riskLevel !== "green" && (
          <div className={`rounded-2xl p-5 ring-1 ${
            risk.riskLevel === "red" ? "bg-red-950/70 ring-red-400/40" :
            risk.riskLevel === "orange" ? "bg-orange-950/60 ring-orange-400/30" :
            "bg-amber-950/50 ring-amber-300/25"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full animate-pulse ${
                  risk.riskLevel === "red" ? "bg-red-400" :
                  risk.riskLevel === "orange" ? "bg-orange-400" : "bg-amber-400"
                }`} />
                <p className="text-xs uppercase tracking-[0.22em] font-bold text-white/80">Compound Risk Detection</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                risk.riskLevel === "red" ? "bg-red-500 text-white" :
                risk.riskLevel === "orange" ? "bg-orange-500 text-white" :
                "bg-amber-400 text-slate-950"
              }`}>{risk.riskLevel} &middot; weight {risk.totalWeight}</span>
            </div>
            <p className="text-white/90 leading-relaxed mb-4">{risk.reasoning.split(". ").slice(0, 3).join(". ")}.</p>
            <div className="space-y-2">
              {risk.signals.map((sig, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-xl px-3 py-2 ${
                  sig.severity === "critical" ? "bg-red-500/15" :
                  sig.severity === "high" ? "bg-red-500/10" :
                  sig.severity === "medium" ? "bg-amber-500/10" : "bg-white/5"
                }`}>
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    sig.severity === "critical" ? "bg-red-400" :
                    sig.severity === "high" ? "bg-red-300" :
                    sig.severity === "medium" ? "bg-amber-300" : "bg-slate-400"
                  }`} />
                  <div>
                    <p className="font-semibold text-white/90">{sig.label}</p>
                    <p className="text-sm text-white/50">{sig.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            {risk.escalated && (
              <p className="mt-3 text-xs text-white/50">Caregiver has been notified via dashboard alert{process.env.NEXT_PUBLIC_HAS_WHATSAPP ? " and WhatsApp" : ""}.</p>
            )}
          </div>
        )}

        {tab === "Chat" ? (
          <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div><p className="text-xs uppercase tracking-[0.22em] text-indigo-300 font-bold">Private caregiver thread</p><p className="text-sm text-slate-400 mt-1">Conversation is saved and can be continued after a refresh.</p></div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-400/10 text-emerald-200 text-xs font-bold ring-1 ring-emerald-300/20">saved</span>
            </div>
            <div ref={cScroll} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 mb-4 scroll-smooth">
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
            <BeamInput value={cInput} onChange={setCInput} onSend={sendC} placeholder="Ask about Eleanor..." />
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
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-xl flex items-center gap-2"><BellIcon className="w-5 h-5" /> Alerts</h2>
            {s.escalations.length > 0 && (
              <button
                onClick={async () => {
                  const response = await fetch(`${API}/escalations/clear`, { method: "POST" });
                  if (response.ok) setS((prev) => ({ ...prev, escalations: [] }));
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 text-slate-300 text-xs font-bold hover:bg-white/20"
              >
                Clear all
              </button>
            )}
          </div>
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

        {/* Browser automation tasks (Nova Act) -- shown from sidecar OR from escalation fallbacks */}
        <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-xl flex items-center gap-2">Browser Automation</h2>
                <p className="text-slate-400 text-sm">Real browser tasks powered by Amazon Nova Act. Approve to execute.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={resetJudgeDemo} disabled={resettingJudgeDemo} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/20 disabled:opacity-60">{resettingJudgeDemo ? "Resetting…" : "Reset judge demo"}</button>
                {!browserTasks.some((task) => task.status === "running" || task.status === "approved" || task.status === "pending_approval") && (
                  <button
                    onClick={createProviderSearchDemo}
                    disabled={demoTaskBusy}
                    className="rounded-xl bg-cyan-300 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
                  >
                    {demoTaskBusy ? "Creating…" : "Find Medicare doctors near Eleanor"}
                  </button>
                )}
                {browserTasks.some((t) => t.status !== "running" && t.status !== "approved") && (
                  <button
                    onClick={() => {
                      const toDelete = browserTasks.filter((t) => t.status !== "running" && t.status !== "approved");
                      setClearingBrowserTasks(true);
                      setBrowserActionError(null);
                      Promise.all(toDelete.map(async (task) => {
                        const response = await fetch(`${API}/browser-agent/${task.task_id}`, { method: "DELETE" });
                        if (!response.ok) throw new Error(`Failed to dismiss ${task.task_id}`);
                      }))
                        .then(() => setBrowserTasks((tasks) => tasks.filter((task) => task.status === "running" || task.status === "approved")))
                        .catch(() => setBrowserActionError("Could not clear inactive tasks. Please try again."))
                        .finally(() => setClearingBrowserTasks(false));
                    }}
                    disabled={clearingBrowserTasks}
                    className="px-3 py-1.5 rounded-xl bg-white/10 text-slate-300 text-xs font-bold hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {clearingBrowserTasks ? "Clearing…" : "Clear inactive"}
                  </button>
                )}
                <span className="px-2.5 py-1 rounded-full bg-fuchsia-400/10 text-fuchsia-200 text-xs font-bold ring-1 ring-fuchsia-300/20">Nova Act</span>
              </div>
            </div>
            {browserActionError && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/20">
                <span>{browserActionError}</span>
                <button onClick={() => setBrowserActionError(null)} className="font-bold text-red-100 hover:text-white">Dismiss</button>
              </div>
            )}
            <div className="space-y-3">
              {browserTasks.map((bt) => {
                const isPending = bt.status === "pending_approval";
                const isRunning = bt.status === "running" || bt.status === "approved";
                const isDone = bt.status === "completed";
                const isFailed = bt.status === "failed";
                return (
                  <div key={bt.task_id} className={`rounded-2xl p-4 ring-1 ring-white/10 ${isPending ? "bg-amber-950/40" : isRunning ? "bg-sky-950/40" : isDone ? "bg-emerald-950/40" : isFailed ? "bg-red-950/40" : "bg-white/5"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${isPending ? "text-amber-300" : isRunning ? "text-sky-300 animate-pulse" : isDone ? "text-emerald-300" : "text-red-300"}`}>
                        [{bt.status}] {bt.task_type.replace(/_/g, " ")}
                      </span>
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <button
                            onClick={async () => {
                              setApprovingTaskId(bt.task_id);
                              setBrowserActionError(null);
                              try {
                                const res = await fetch(`${API}/browser-agent/${bt.task_id}/approve`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ task_type: bt.task_type, params: bt.params }),
                                });
                                const result = await res.json();
                                setBrowserTasks((ts) => ts.map((t) => t.task_id === bt.task_id ? { ...t, ...result } : t));
                                if (!res.ok || result.status === "failed") {
                                  throw new Error(result.error ?? "Nova Act could not start this task");
                                }
                              } catch (error) {
                                setBrowserActionError(error instanceof Error ? error.message : "Nova Act could not start this task");
                              } finally {
                                setApprovingTaskId(null);
                              }
                            }}
                            disabled={approvingTaskId === bt.task_id}
                            className="px-4 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
                          >
                            {approvingTaskId === bt.task_id ? "Starting Nova Act…" : "Approve & Execute"}
                          </button>
                        )}
                        {!isRunning && (
                          <button
                            onClick={() => {
                              fetch(`${API}/browser-agent/${bt.task_id}`, { method: "DELETE" })
                                .then((response) => {
                                  if (!response.ok) throw new Error(`Failed to dismiss ${bt.task_id}`);
                                  setBrowserTasks((ts) => ts.filter((t) => t.task_id !== bt.task_id));
                                })
                                .catch(() => setBrowserActionError("Could not dismiss this task. Please try again."));
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/10 text-slate-300 text-xs font-bold hover:bg-red-950/50 hover:text-red-200"
                            title="Dismiss this task"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mb-3 rounded-xl bg-slate-950/60 p-3 ring-1 ring-white/10">
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Execution proof</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                        <span className="rounded-md bg-violet-400/15 px-2 py-1 text-violet-200">Strands task</span><span className="text-slate-500">→</span>
                        <span className={isPending ? "rounded-md bg-amber-400/20 px-2 py-1 text-amber-200" : "rounded-md bg-emerald-400/15 px-2 py-1 text-emerald-200"}>Caregiver approval</span><span className="text-slate-500">→</span>
                        <span className={isRunning || isDone ? "rounded-md bg-sky-400/20 px-2 py-1 text-sky-200" : "rounded-md bg-slate-400/10 px-2 py-1 text-slate-400"}>Nova Act + AgentCore</span><span className="text-slate-500">→</span>
                        <span className={isDone ? "rounded-md bg-emerald-400/20 px-2 py-1 text-emerald-200" : isFailed ? "rounded-md bg-red-400/20 px-2 py-1 text-red-200" : "rounded-md bg-slate-400/10 px-2 py-1 text-slate-400"}>{browserProofStage(bt.status)}</span>
                      </div>
                      {bt.sidecar_task_id && <div className="mt-2 font-mono text-[10px] text-slate-500">sidecar_task_id: {bt.sidecar_task_id}</div>}
                    </div>
                    {bt.params && Object.keys(bt.params).length > 0 && (
                      <div className="text-sm text-slate-300 mb-2">
                        {Object.entries(bt.params).filter(([k]) => k !== "username" && k !== "password").map(([k, v]) => (
                          <span key={k} className="inline-block mr-3">{k}: <span className="text-white font-semibold">{String(v)}</span></span>
                        ))}
                      </div>
                    )}
                    {bt.steps.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {bt.steps.map((step, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full ${step.status === "completed" ? "bg-emerald-400" : step.status === "running" ? "bg-sky-400 animate-pulse" : "bg-slate-500"}`} />
                            <span className={step.status === "completed" ? "text-emerald-200" : "text-slate-400"}>{step.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {bt.result && (
                      <div className="mt-2 rounded-xl bg-emerald-400/10 p-3 text-sm">
                        {Object.entries(bt.result).map(([k, v]) => (
                          <div key={k}><span className="text-emerald-200 font-semibold">{k}:</span> <span className="whitespace-pre-wrap text-white">{formatBrowserResult(v)}</span></div>
                        ))}
                      </div>
                    )}
                    {bt.error && <p className="mt-2 text-sm text-red-300">{bt.error}</p>}
                    {/* Live browser view via ACBT -- only while task is RUNNING */}
                    {bt.recording_url && isRunning && (
                      <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-sky-400/30">
                        <div className="flex items-center bg-sky-950/60 px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-bold text-sky-200 uppercase tracking-wider">Live Browser Session</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-950" style={{ aspectRatio: "16 / 9" }}>
                          <StableBrowserLiveView signedUrl={bt.recording_url} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Fallback: show browser task requests from escalations when sidecar is offline */}
            {browserTasks.length === 0 && s.escalations.filter((e) => e.message.includes("Browser task requested")).map((e, i) => {
              const match = e.message.match(/Browser task requested.*?\((\w+)\):\s*(.+?)(?:\.|$)/);
              const taskType = match?.[1] ?? "insurance_check";
              const taskLabel = taskType.replace(/_/g, " ");
              const reason = match?.[2] ?? e.message;
              return (
                <div key={`bt-esc-${i}`} className="mt-3 rounded-2xl p-4 ring-1 ring-fuchsia-400/20 bg-fuchsia-950/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">[requested] {taskLabel}</span>
                    <button
                      onClick={async () => {
                        const fallbackTaskId = `escalation-${i}`;
                        setApprovingTaskId(fallbackTaskId);
                        setBrowserActionError(null);
                        try {
                          const res = await fetch(`${API}/browser-agent/${fallbackTaskId}/approve`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ task_type: taskType, params: {} }),
                          });
                          const result = await res.json();
                          setBrowserTasks((ts) => [...ts, result]);
                          if (!res.ok || result.status === "failed") {
                            throw new Error(result.error ?? "Nova Act could not start this task");
                          }
                        } catch (error) {
                          setBrowserActionError(error instanceof Error ? error.message : "Nova Act could not start this task");
                        } finally {
                          setApprovingTaskId(null);
                        }
                      }}
                      disabled={approvingTaskId === `escalation-${i}`}
                      className="px-4 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
                    >
                      {approvingTaskId === `escalation-${i}` ? "Starting Nova Act…" : "Approve & Execute via AgentCore"}
                    </button>
                  </div>
                  <p className="text-sm text-white/80">{reason}</p>
                </div>
              );
            })}
        </section>

        {/* Background tasks */}
        <section className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-xl">Background agent</h2>
            {tasks.some((task) => task.status === "done" || task.status === "failed") && (
              <button
                onClick={async () => {
                  setClearingBackgroundTasks(true);
                  try {
                    const response = await fetch(`${API}/tasks?user_id=eleanor-79`, { method: "DELETE" });
                    if (!response.ok) throw new Error("clear failed");
                    setTasks((current) => current.filter((task) => task.status !== "done" && task.status !== "failed"));
                  } catch {
                    setBrowserActionError("Could not clear background task history. Please try again.");
                  } finally {
                    setClearingBackgroundTasks(false);
                  }
                }}
                disabled={clearingBackgroundTasks}
                className="px-3 py-1.5 rounded-xl bg-white/10 text-slate-300 text-xs font-bold hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
              >
                {clearingBackgroundTasks ? "Clearing…" : "Clear history"}
              </button>
            )}
          </div>
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
