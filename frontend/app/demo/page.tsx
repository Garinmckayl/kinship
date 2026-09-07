"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { BellIcon, CheckIcon, HeartIcon, PhoneIcon, PillIcon } from "@/components/icons";

type PharmacyStep = { id: string; label: string; detail: string; status: string };
type PharmacyRun = {
  mode: string;
  status: string;
  medication: string;
  pharmacy: string;
  confirmationNumber: string;
  pickupAt: string;
  caregiverMessage: string;
  steps: PharmacyStep[];
};
type PillAudit = {
  mode: string;
  model: string;
  summary: string;
  safeToTakeNow: boolean;
  observations: { slot: string; status: string; detail: string }[];
};
type ScamIntercept = {
  mode: string;
  verdict: string;
  callerBlocked: boolean;
  bankFreeze: { status: string; reference: string };
  report: { status: string; reference: string };
  caregiverAlert: string;
};
type ProactiveInsight = {
  message: string;
  reason: string;
  nodes: { id: string; label: string; kind: string }[];
  edges: { from: string; relation: string; to: string }[];
};

const scamTranscript = "This is Agent Miller from the IRS. You have an outstanding federal warrant payable in Apple Gift Cards. Do not tell your family.";

function SectionLabel({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs uppercase tracking-[0.24em] text-indigo-300 font-bold">{eyebrow}</p>
      <h2 className="text-2xl sm:text-3xl font-black mt-1">{title}</h2>
      <p className="text-slate-300 mt-2 max-w-2xl">{copy}</p>
    </div>
  );
}

function StatusDot({ state }: { state: string }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${state === "complete" || state === "blocked" || state === "clear" ? "bg-emerald-400" : state === "attention" || state === "review" ? "bg-amber-400" : "bg-indigo-300"}`} />;
}

export default function DemoLabPage() {
  const [pharmacy, setPharmacy] = useState<PharmacyRun | null>(null);
  const [pharmacyRunning, setPharmacyRunning] = useState(false);
  const [pharmacyStep, setPharmacyStep] = useState(-1);
  const pharmacyTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionNote, setVisionNote] = useState("");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [audit, setAudit] = useState<PillAudit | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [scamBusy, setScamBusy] = useState(false);
  const [scam, setScam] = useState<ScamIntercept | null>(null);
  const [insight, setInsight] = useState<ProactiveInsight | null>(null);
  const [graphBusy, setGraphBusy] = useState(false);

  useEffect(() => () => {
    if (pharmacyTimer.current) clearInterval(pharmacyTimer.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOn]);

  async function runPharmacy() {
    if (pharmacyRunning) return;
    setPharmacy(null);
    setPharmacyRunning(true);
    setPharmacyStep(0);
    pharmacyTimer.current = setInterval(() => setPharmacyStep((n) => Math.min(n + 1, 4)), 600);
    try {
      const response = await fetch("/api/demo/pharmacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ medication: "Lisinopril 10 mg" }) });
      if (!response.ok) throw new Error("pharmacy worker failed");
      const result = (await response.json()) as PharmacyRun;
      setPharmacy(result);
      setPharmacyStep(4);
    } catch {
      setPharmacy(null);
    } finally {
      if (pharmacyTimer.current) clearInterval(pharmacyTimer.current);
      pharmacyTimer.current = null;
      setPharmacyRunning(false);
    }
  }

  async function startCamera() {
    setVisionNote("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch {
      setVisionNote("Camera permission was not available. The deterministic pill-tray audit is still ready below.");
    }
  }

  async function auditPills() {
    setVisionBusy(true);
    setVisionNote("");
    try {
      let image: string | undefined;
      const video = videoRef.current;
      if (video && video.videoWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 1280);
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        image = canvas.toDataURL("image/jpeg", 0.78);
        setSnapshot(image);
      }
      const response = await fetch("/api/demo/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      if (!response.ok) throw new Error("vision failed");
      setAudit((await response.json()) as PillAudit);
    } catch {
      setVisionNote("The visual check could not complete. Try once more, or use the deterministic demo result.");
    } finally {
      setVisionBusy(false);
    }
  }

  async function intercept() {
    setScamBusy(true);
    try {
      const response = await fetch("/api/demo/scam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: scamTranscript }) });
      if (!response.ok) throw new Error("scam intercept failed");
      setScam((await response.json()) as ScamIntercept);
    } catch {}
    setScamBusy(false);
  }

  async function runGraph() {
    setGraphBusy(true);
    try {
      const response = await fetch("/api/demo/proactive", { method: "POST" });
      if (!response.ok) throw new Error("graph failed");
      setInsight((await response.json()) as ProactiveInsight);
    } catch {}
    setGraphBusy(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_48%,#050418_100%)] text-white">
      <Nav />
      <div className="max-w-6xl mx-auto px-5 py-10 sm:py-14 space-y-10">
        <header className="flex flex-col lg:flex-row lg:items-end gap-5 justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-fuchsia-400/10 ring-1 ring-fuchsia-300/30 px-3 py-1 text-xs uppercase tracking-[0.2em] text-fuchsia-200 font-bold">
              <span className="w-2 h-2 rounded-full bg-fuchsia-300 animate-pulse" /> Real-world agent lab
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight mt-4">The pharmacy phone-tree buster.</h1>
            <p className="text-xl text-indigo-200 max-w-3xl mt-4">Four judge-ready moments that prove Kinship can observe, decide, and act in the world — with a safe offline fallback for every live dependency.</p>
          </div>
          <div className="flex gap-2 text-sm shrink-0">
            <Link href="/elder" className="px-4 py-2 rounded-xl bg-white/10 ring-1 ring-white/15 hover:bg-white/15">Eleanor view</Link>
            <Link href="/family" className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold">Caregiver output</Link>
          </div>
        </header>

        <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5">
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 sm:p-7">
            <SectionLabel eyebrow="01 · outbound action" title="“I’m down to my last three.”" copy="Kinship calls the pharmacy, navigates the IVR with DTMF, records a confirmation number, and hands the caregiver a useful next step." />
            <div className="rounded-2xl bg-slate-950/70 ring-1 ring-white/10 p-4 mb-5">
              <div className="flex items-center gap-3 text-emerald-300 font-bold"><PhoneIcon className="w-5 h-5" /> Eleanor → Kinship</div>
              <p className="text-lg mt-2">“My blood pressure pills are down to the last three.”</p>
            </div>
            <button onClick={runPharmacy} disabled={pharmacyRunning} className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 font-bold">
              {pharmacyRunning ? "Calling pharmacy…" : "Run pharmacy worker"}
            </button>
            <div className="mt-5 space-y-2">
              {(pharmacy?.steps ?? [
                { id: "dial", label: "Outbound call placed", detail: "Twilio SIP worker → CVS Pharmacy · 4th Ave", status: "pending" },
                { id: "pharmacy", label: "Pharmacy menu selected", detail: "DTMF 1 · Press 1 for Pharmacy", status: "pending" },
                { id: "refill", label: "Refill menu selected", detail: "DTMF 2 · Press 2 for refills", status: "pending" },
                { id: "rx", label: "Prescription number entered", detail: "DTMF RX-4472", status: "pending" },
                { id: "confirm", label: "Refill confirmed", detail: "Ready Thursday · 2:00 PM", status: "pending" },
              ]).map((step, i) => {
                const complete = pharmacyRunning ? i <= pharmacyStep : step.status === "complete";
                return <div key={step.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${complete ? "bg-emerald-400/10" : "bg-white/[0.03]"}`}><span className={`w-7 h-7 rounded-full grid place-items-center ${complete ? "bg-emerald-400 text-slate-950" : "bg-white/10 text-slate-400"}`}>{complete ? <CheckIcon className="w-4 h-4" /> : i + 1}</span><div className="flex-1"><p className={`font-semibold ${complete ? "text-emerald-200" : "text-slate-400"}`}>{step.label}</p><p className="text-xs text-slate-400">{step.detail}</p></div></div>;
              })}
            </div>
            {pharmacy && <div className="mt-5 rounded-2xl bg-emerald-400/10 ring-1 ring-emerald-300/30 p-4"><p className="text-emerald-200 font-black">{pharmacy.caregiverMessage}</p><p className="text-sm text-emerald-100/70 mt-1">Confirmation {pharmacy.confirmationNumber} · {pharmacy.mode === "mock" ? "deterministic demo call" : "live Twilio leg"}</p></div>}
          </div>

          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 sm:p-7">
            <SectionLabel eyebrow="02 · multimodal vision" title="Pill tray, not a yes/no checkbox." copy="Eleanor points the camera at the organizer. Kinship spots a missed compartment and gives a safe, plain-language next step." />
            <div className="rounded-2xl overflow-hidden bg-slate-950/80 ring-1 ring-white/10 aspect-video grid place-items-center relative">
              {cameraOn ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" /> : snapshot ? <img src={snapshot} alt="Pill organizer snapshot" className="w-full h-full object-cover" /> : <div className="text-center text-slate-400 px-6"><PillIcon className="w-12 h-12 mx-auto text-indigo-300 mb-2" /><p>Camera preview appears here</p><p className="text-xs mt-1">Or run the deterministic organizer audit.</p></div>}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={startCamera} className="px-4 py-2 rounded-xl bg-white/10 ring-1 ring-white/15 hover:bg-white/15">Open camera</button>
              <button onClick={auditPills} disabled={visionBusy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 font-bold">{visionBusy ? "Inspecting…" : "Inspect pill tray"}</button>
            </div>
            {visionNote && <p className="text-amber-200 text-sm mt-3">{visionNote}</p>}
            {audit && <div className="mt-5 space-y-3"><div className="rounded-2xl bg-amber-400/10 ring-1 ring-amber-300/30 p-4"><p className="font-black text-amber-100">{audit.summary}</p><p className="text-xs text-amber-100/60 mt-2">{audit.model} · {audit.mode}</p></div>{audit.observations.map((o) => <div key={o.slot} className="flex gap-3 items-start"><StatusDot state={o.status} /><div><p className="font-semibold">{o.slot}</p><p className="text-sm text-slate-400">{o.detail}</p></div></div>)}<p className={`text-sm font-bold ${audit.safeToTakeNow ? "text-emerald-300" : "text-rose-300"}`}>{audit.safeToTakeNow ? "No exception detected." : "Safety hold: do not take an unidentified extra dose."}</p></div>}
          </div>
        </section>

        <section className="grid lg:grid-cols-[0.9fr_1.1fr] gap-5">
          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 sm:p-7">
            <SectionLabel eyebrow="03 · adversarial defense" title="The scammer gets interrupted." copy="The interceptor hears the threat, blocks the caller, queues a report, freezes the linked card through a mock bank webhook, and alerts Sarah." />
            <div className="rounded-2xl bg-red-950/40 ring-1 ring-red-300/25 p-4"><div className="flex items-center gap-2 text-red-200 font-bold"><BellIcon className="w-5 h-5" /> Live call transcript</div><p className="mt-3 text-red-50/90 leading-relaxed">“{scamTranscript}”</p><div className="flex items-center gap-1 mt-4">{Array.from({ length: 28 }).map((_, i) => <span key={i} className={`w-1 rounded-full bg-red-300/70 ${i % 3 === 0 ? "h-6" : i % 2 === 0 ? "h-3" : "h-4"}`} />)}</div></div>
            <button onClick={intercept} disabled={scamBusy} className="mt-5 w-full px-5 py-3 rounded-2xl bg-red-500 hover:bg-red-400 disabled:opacity-60 font-black">{scamBusy ? "Intercept protocol running…" : "Trigger audio intercept"}</button>
            {scam && <div className="mt-5 space-y-2"><div className="rounded-2xl bg-emerald-400/10 ring-1 ring-emerald-300/30 p-4"><p className="font-black text-emerald-200">Eleanor, do not hang up or give them any numbers. I am blocking this caller now.</p><p className="text-sm text-emerald-100/70 mt-2">{scam.caregiverAlert}</p></div><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-white/5 p-3"><p className="text-slate-400">Caller</p><p className="font-bold text-emerald-300">{scam.callerBlocked ? "blocked" : "review"}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-slate-400">Card</p><p className="font-bold text-amber-200">{scam.bankFreeze.status}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-slate-400">Report</p><p className="font-bold text-sky-200">{scam.report.status}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-slate-400">Funds</p><p className="font-bold text-emerald-300">none transferred</p></div></div></div>}
          </div>

          <div className="bg-white/5 ring-1 ring-white/10 rounded-3xl p-5 sm:p-7">
            <SectionLabel eyebrow="04 · temporal cognition" title="A graph that remembers when." copy="Kinship connects Eleanor’s left-knee memory from Day 1 to a Day 14 weather signal, then acts before she asks." />
            <div className="grid sm:grid-cols-4 gap-2 items-center mb-5">
              {["Day 1 · memory", "worsens when", "Day 14 · weather", "action"].map((label, i) => <div key={label} className="relative"><div className={`rounded-xl px-3 py-3 text-center text-xs font-bold ring-1 ${i === 0 ? "bg-indigo-500/20 ring-indigo-300/30 text-indigo-100" : i === 2 ? "bg-sky-500/20 ring-sky-300/30 text-sky-100" : i === 3 ? "bg-emerald-500/20 ring-emerald-300/30 text-emerald-100" : "bg-white/5 ring-white/10 text-slate-300"}`}>{label}</div>{i < 3 && <span className="hidden sm:block absolute -right-2 top-1/2 text-slate-500">→</span>}</div>)}
            </div>
            <button onClick={runGraph} disabled={graphBusy} className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black disabled:opacity-60">{graphBusy ? "Joining events…" : "Run proactive check"}</button>
            {insight && <div className="mt-5 rounded-2xl bg-emerald-400/10 ring-1 ring-emerald-300/30 p-4"><p className="text-lg font-black text-emerald-100">{insight.message}</p><p className="text-sm text-emerald-100/70 mt-2">{insight.reason}</p><div className="flex flex-wrap gap-2 mt-4">{insight.nodes.map((node) => <span key={node.id} className="px-2.5 py-1 rounded-full bg-white/10 text-xs text-slate-200">{node.label}</span>)}</div><div className="mt-3 space-y-1 text-xs text-slate-400">{insight.edges.map((edge) => <p key={`${edge.from}-${edge.to}`}>{insight.nodes.find((n) => n.id === edge.from)?.label} <span className="text-indigo-300">{edge.relation}</span> {insight.nodes.find((n) => n.id === edge.to)?.label}</p>)}</div></div>}
          </div>
        </section>

        <footer className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm text-slate-400">
          <p className="flex items-center gap-2"><HeartIcon className="w-4 h-4 text-rose-300" /> Dignity for elders. Absolute peace of mind for their children.</p>
          <p>Demo Lab is mock-first. Live external actions require explicit environment flags.</p>
        </footer>
      </div>
    </main>
  );
}

