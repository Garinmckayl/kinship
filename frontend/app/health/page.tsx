"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, Btn, Badge, Input, Field } from "@/components/ui";
import { Nav } from "@/components/Nav";

type Metric = { type: string; value: number; unit: string; at: string; source: string };
type Trends = { latest: Record<string, { value: number; unit: string; at: string }>; weekAvg: Record<string, { avg: number; n: number }>; readings7d: number };

const PRETTY: Record<string, string> = {
  blood_pressure_sys: "Blood pressure (sys)", blood_pressure_dia: "Blood pressure (dia)",
  heart_rate: "Heart rate", steps: "Steps", sleep_hours: "Sleep", weight_kg: "Weight",
};

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="text-xs text-slate-500">Need 2+ readings for trend</p>;
  const w = 160, h = 48;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - 4 - ((p - min) / span) * (h - 8)}`).join(" L");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={d} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function HealthPage() {
  const [authed, setAuthed] = useState(false);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [form, setForm] = useState({ type: "blood_pressure_sys", value: "", unit: "mmHg" });

  const load = () => {
    fetch("/api/health?trends=1").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setTrends(d); setAuthed(true); } }).catch(() => {});
    fetch("/api/health").then((r) => (r.ok ? r.json() : null)).then((d) => d && setMetrics(d.metrics ?? [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function log() {
    const v = parseFloat(form.value);
    if (!form.type || isNaN(v)) return;
    const res = await fetch("/api/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: form.type, value: v, unit: form.unit }) });
    if (res.ok) { setForm({ ...form, value: "" }); load(); }
  }

  const byType: Record<string, number[]> = {};
  for (const m of [...metrics].reverse()) {
    (byType[m.type] = byType[m.type] ?? []).push(m.value);
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
        <Nav />
        <div className="grid place-items-center px-5 py-20">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">Health</h1>
          <p className="text-slate-300">Caregiver login required.</p>
          <Link href="/login" className="inline-block px-8 py-3 rounded-2xl bg-indigo-600 font-bold">Log in</Link>
        </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      <Nav />
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-5 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Health</h1>
          <Link href="/family" className="text-indigo-300 text-sm">← Dashboard</Link>
        </div>

        <Card>
          <CardTitle>Vitals overview</CardTitle>
          {!trends || Object.keys(trends.latest).length === 0 ? (
            <p className="text-slate-400">No readings yet. Log below, connect a watch to <code>POST /api/health</code> (REPORT_SECRET as ingest key), or let Ruth tell the agent: "my blood pressure is 130 over 85".</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {Object.entries(trends.latest).map(([t, v]) => (
                <div key={t} className="bg-slate-950/60 ring-1 ring-white/10 rounded-2xl p-4">
                  <p className="text-sm text-slate-400">{PRETTY[t] ?? t}</p>
                  <p className="text-3xl font-bold">{v.value} <span className="text-base font-normal text-slate-400">{v.unit}</span></p>
                  <div className="mt-2"><Spark points={(byType[t] ?? []).slice(-14)} /></div>
                  {trends.weekAvg[t] && <p className="text-xs text-slate-400 mt-1">7-day avg {trends.weekAvg[t].avg} · {trends.weekAvg[t].n} readings</p>}
                </div>
              ))}
            </div>
          )}
          {trends && <p className="text-xs text-slate-500 mt-3">{trends.readings7d} readings in last 7 days · trends only, never diagnosis</p>}
        </Card>

        <Card>
          <CardTitle>Log a reading</CardTitle>
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-white/5 ring-1 ring-white/10 rounded-xl px-3 py-2 outline-none text-white">
                {Object.entries(PRETTY).map(([v, l]) => <option key={v} value={v} className="bg-slate-900">{l}</option>)}
              </select>
            </Field>
            <Field label="Value"><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} type="number" placeholder="120" /></Field>
            <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="mmHg" /></Field>
            <div className="flex items-end"><Btn onClick={log}>Log</Btn></div>
          </div>
        </Card>

        <Card>
          <CardTitle>Recent readings</CardTitle>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {metrics.slice(0, 20).map((m, i) => (
              <p key={i} className="text-sm text-slate-300 flex justify-between">
                <span>{PRETTY[m.type] ?? m.type}: <b className="text-white">{m.value} {m.unit}</b> <Badge tone="slate">{m.source}</Badge></span>
                <span className="text-slate-500">{new Date(m.at).toLocaleString()}</span>
              </p>
            ))}
            {metrics.length === 0 && <p className="text-slate-400 text-sm">None yet.</p>}
          </div>
        </Card>
      </div>
    </main>
  );
}
