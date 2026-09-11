"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, Btn, Badge, Input, Field, CalendarMonth } from "@/components/ui";
import { Nav } from "@/components/Nav";

type Appt = { id: string; title: string; doctor: string; location: string; at: string; notes: string; status: string };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [day, setDay] = useState(now.getDate());
  const [appts, setAppts] = useState<Appt[]>([]);
  const [form, setForm] = useState({ title: "", doctor: "", location: "", at: "", notes: "" });
  const [authed, setAuthed] = useState(false);
  const [notice, setNotice] = useState("");
  const [calendarConnected, setCalendarConnected] = useState(false);

  const load = () =>
    fetch("/api/appointments").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setAppts(d.appointments ?? []); setCalendarConnected(Boolean(d.calendarConnected)); setAuthed(true); }
    }).catch(() => {});

  useEffect(() => { load(); }, []);

  const marks: Record<number, number> = {};
  for (const a of appts) {
    const d = new Date(a.at);
    if (d.getFullYear() === year && d.getMonth() === month) marks[d.getDate()] = (marks[d.getDate()] ?? 0) + 1;
  }
  const dayAppts = appts.filter((a) => {
    const d = new Date(a.at);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
  const upcoming = [...appts].sort((a, b) => +new Date(a.at) - +new Date(b.at)).slice(0, 5);

  async function add() {
    if (!form.title || !form.at) return;
    const res = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setAppts((a) => [...a, d.appointment]);
      setForm({ title: "", doctor: "", location: "", at: "", notes: "" });
      setNotice("Request staged. A caregiver must approve it before it is booked or synced.");
    } else setNotice(d.error ?? "Could not stage appointment request.");
  }

  async function approve(id: string) {
    const res = await fetch(`/api/appointments/${id}/approve`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice("Approved. The appointment is now booked and " + (d.calendar === "synced" ? "synced to Google Calendar." : "saved in Kinship."));
      load();
    } else setNotice(d.error ?? "Approval failed.");
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    if (res.ok) load();
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
        <Nav />
        <div className="grid place-items-center px-5 py-20">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">Doctor calendar</h1>
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
          <div><h1 className="text-3xl font-bold">Care calendar</h1><p className="mt-1 text-sm text-slate-400">Kinship proposes. Family decides. Every outcome stays visible.</p></div>
          <Link href="/family" className="text-indigo-300 text-sm">← Dashboard</Link>
        </div>

        <Card>
          <div className="grid gap-3 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <div><Badge tone="slate">1</Badge><p className="mt-2 font-bold">Eleanor asks</p><p className="text-xs text-slate-400">Voice or chat</p></div>
            <span className="hidden text-slate-500 sm:block">→</span>
            <div><Badge tone="amber">2</Badge><p className="mt-2 font-bold">Sarah approves</p><p className="text-xs text-slate-400">Human decision</p></div>
            <span className="hidden text-slate-500 sm:block">→</span>
            <div><Badge tone={calendarConnected ? "green" : "slate"}>3</Badge><p className="mt-2 font-bold">Kinship closes the loop</p><p className="text-xs text-slate-400">{calendarConnected ? "Google Calendar connected" : "Saved in Kinship; Google sync optional"}</p></div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <Btn variant="ghost" onClick={() => { const m = month - 1; if (m < 0) { setYear(year - 1); setMonth(11); } else setMonth(m); }}>←</Btn>
            <p className="font-bold text-lg">{MONTHS[month]} {year}</p>
            <Btn variant="ghost" onClick={() => { const m = month + 1; if (m > 11) { setYear(year + 1); setMonth(0); } else setMonth(m); }}>→</Btn>
          </div>
          <CalendarMonth year={year} month={month} marks={marks} selected={day} onPick={setDay} />
        </Card>

        <Card>
          <CardTitle>Selected day — {MONTHS[month]} {day}</CardTitle>
          {dayAppts.length === 0 ? <p className="text-slate-400">Nothing scheduled. Eleanor can just ask: "book my cardiologist Tuesday at 10".</p> : (
            <div className="space-y-2">
              {dayAppts.map((a) => (
                <div key={a.id} className="bg-slate-950/60 ring-1 ring-white/10 rounded-2xl p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-bold">{a.title} {a.doctor && <span className="font-normal text-slate-300">· {a.doctor}</span>}</p>
                    <p className="text-sm text-slate-400">{new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {a.location && `· ${a.location}`}</p>
                  </div>
                  <Badge tone={a.status === "cancelled" ? "red" : a.status === "proposed" ? "amber" : "green"}>{a.status === "proposed" ? "approval needed" : a.status}</Badge>
                  {a.status === "proposed" ? <Btn onClick={() => approve(a.id)}>Approve & sync</Btn> : a.status !== "cancelled" && <Btn variant="ghost" onClick={() => cancel(a.id)}>Cancel</Btn>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Request an appointment</CardTitle>
          <p className="text-sm text-amber-200/80 mb-4">Human approval required. This stays proposed until a caregiver taps Approve & sync.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Cardiologist visit" /></Field>
            <Field label="Doctor"><Input value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} placeholder="Dr. Alemu" /></Field>
            <Field label="Date & time"><Input value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} type="datetime-local" /></Field>
            <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Tikur Anbessa, Room 4" /></Field>
          </div>
          <div className="mt-3"><Btn onClick={add}>Send for approval</Btn></div>
          {notice && <p className="text-sm text-emerald-200 mt-3">{notice}</p>}
          <p className="text-xs text-slate-500 mt-2">Nothing reaches Google Calendar until a caregiver explicitly approves it. Eleanor can also request one by voice.</p>
        </Card>

        <Card>
          <CardTitle>Upcoming</CardTitle>
          <div className="space-y-2">
            {upcoming.map((a) => (
              <p key={a.id} className="text-slate-200">
                <b>{new Date(a.at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</b> · {a.title} {a.doctor && `(${a.doctor})`}
              </p>
            ))}
            {upcoming.length === 0 && <p className="text-slate-400">Nothing upcoming.</p>}
          </div>
        </Card>
      </div>
    </main>
  );
}
