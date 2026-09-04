"use client";
import { useEffect, useRef, useState } from "react";
import { BorderBeam } from "border-beam";
import { AgentOrb, PHASE_LABEL, type AgentPhase } from "@/components/AgentOrb";
import { BeamInput } from "@/components/BeamInput";
import { CallScreen, IncomingCall } from "@/components/CallScreen";
import { BellIcon, ChatIcon, CheckIcon, HeartIcon, MicIcon, PhoneIcon } from "@/components/icons";

const API = "/api";
type Msg = { role: "agent" | "elder"; text: string };
type CallMode = "off" | "ringing" | "active";

export default function ElderPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Good morning Ruth 💜 Did you take your Lisinopril? Tap Yes or just talk to me." },
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [callMode, setCallMode] = useState<CallMode>("off");
  const [seconds, setSeconds] = useState(0);
  const [wakeOn, setWakeOn] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recogRef = useRef<any>(null);
  const wakeRecRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  callActiveRef.current = callMode === "active";
  const phaseRef = useRef<AgentPhase>("idle");
  phaseRef.current = phase;
  const wakeOnRef = useRef(false);
  wakeOnRef.current = wakeOn;

  useEffect(() => {
    return () => {
      try { wakeRecRef.current?.abort(); recogRef.current?.abort(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (callMode !== "active") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callMode]);

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
  }

  async function send(text: string) {
    if (!text.trim()) return;
    stopAudio();
    setMsgs((m) => [...m, { role: "elder", text }]);
    setInput("");
    setPhase("connecting");
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "ruth-78", message: text }),
      });
      const data = await res.json();
      const reply = data.reply ?? "I'm here with you.";
      setMsgs((m) => [...m, { role: "agent", text: reply }]);
      await speak(reply);
    } catch {
      setMsgs((m) => [...m, { role: "agent", text: "(offline) Logged with love. Your family is notified only if needed. 💜" }]);
      setPhase("idle");
    }
  }

  // ElevenLabs voice first, browser TTS fallback. Auto-listens after speaking on calls.
  async function speak(text: string) {
    setPhase("speaking");
    try {
      const res = await fetch(`${API}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok && res.headers.get("Content-Type")?.includes("audio")) {
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setPhase("idle");
          if (callActiveRef.current) voiceInput();
        };
        await audio.play();
        return;
      }
    } catch {}
    browserSpeak(text);
  }

  function browserSpeak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.onend = () => {
        setPhase("idle");
        if (callActiveRef.current) voiceInput();
      };
      speechSynthesis.speak(u);
    } catch {
      setPhase("idle");
    }
  }

  function voiceInput() {
    try { recogRef.current?.abort(); } catch {}
    try { wakeRecRef.current?.abort(); } catch {}
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    setPhase("listening");
    const rec = new SR();
    recogRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: any) => send(e.results[0][0].transcript);
    rec.onerror = () => {
      setPhase("idle");
      if (wakeOnRef.current) startWakeLoop();
    };
    rec.onend = () => {
      setPhase((p) => (p === "listening" ? "idle" : p));
      if (wakeOnRef.current) startWakeLoop();
    };
    try { rec.start(); } catch {
      setPhase("idle");
      if (wakeOnRef.current) startWakeLoop();
    }
  }

  // Hands-free wake word: Ruth just says "ElderLove…" from her chair.
  // Browser keyword spotting (free, today). Pro path: Porcupine WASM for iOS reliability.
  function chime() {
    try {
      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      [880, 1318].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.start(t);
        o.stop(t + 0.16);
      });
    } catch {}
  }

  function startWakeLoop() {
    if (wakeRecRef.current) return; // already listening for the name
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      setWakeOn(false);
      return;
    }
    const rec = new SR();
    wakeRecRef.current = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      if (phaseRef.current !== "idle" || callActiveRef.current) return;
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
      if (/elder\s?love/.test(text.toLowerCase())) {
        try { wakeRecRef.current?.abort(); } catch {}
        wakeRecRef.current = null;
        chime();
        voiceInput();
      }
    };
    rec.onerror = (e: any) => {
      wakeRecRef.current = null;
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") setWakeOn(false);
      else if (wakeOnRef.current && phaseRef.current === "idle") setTimeout(startWakeLoop, 800);
    };
    rec.onend = () => {
      wakeRecRef.current = null;
      if (wakeOnRef.current && phaseRef.current === "idle" && !callActiveRef.current) setTimeout(startWakeLoop, 400);
    };
    try {
      rec.start();
    } catch {
      wakeRecRef.current = null;
      setWakeOn(false);
    }
  }

  function toggleWake() {
    if (wakeOn) {
      setWakeOn(false);
      try { wakeRecRef.current?.abort(); } catch {}
      wakeRecRef.current = null;
    } else {
      setWakeOn(true);
      setTimeout(startWakeLoop, 50);
    }
  }

  function simulateCall() {
    setCallMode("ringing");
    setPhase("idle");
  }

  function acceptCall() {
    setCallMode("active");
    setSeconds(0);
    send("Hello? I just answered your call.");
  }

  function endCall() {
    stopAudio();
    try { recogRef.current?.abort(); speechSynthesis.cancel(); } catch {}
    setCallMode("off");
    setPhase("idle");
  }

  const lastAgent = [...msgs].reverse().find((m) => m.role === "agent")?.text ?? "";

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white">
      {callMode === "ringing" && <IncomingCall onAccept={acceptCall} onDecline={() => setCallMode("off")} />}
      {callMode === "active" && (
        <CallScreen
          phase={phase}
          caption={lastAgent}
          seconds={seconds}
          onTalk={voiceInput}
          onEnd={endCall}
          input={input}
          setInput={setInput}
          onSend={() => send(input)}
        />
      )}

      <div className="max-w-xl mx-auto px-4 pt-10 pb-40">
        {/* Orb hero */}
        <div className="flex flex-col items-center text-center gap-3">
          <BorderBeam size="pulse-outside" colorVariant="ocean" theme="dark">
            <div className="rounded-full bg-indigo-500/10 px-8 py-6">
              <AgentOrb phase={phase} scale={2.5} dark />
            </div>
          </BorderBeam>
          <h1 className="text-4xl font-bold mt-2 flex items-center gap-2">Hi Ruth <HeartIcon className="w-8 h-8 text-rose-400" /></h1>
          <p className="text-indigo-200 text-xl">{wakeOn && phase === "idle" ? "Say “ElderLove” — I'm listening" : PHASE_LABEL[phase]}</p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={toggleWake}
              className={`px-6 py-3 rounded-2xl text-white text-xl font-bold flex items-center gap-2 ${wakeOn ? "bg-red-500 animate-pulse" : "bg-slate-700 hover:bg-slate-600"}`}
            >
              <BellIcon className="w-6 h-6" /> {wakeOn ? "Wake word ON" : "Wake word OFF"}
            </button>
          </div>
          <button
            onClick={simulateCall}
            className="mt-2 px-6 py-3 rounded-2xl bg-green-500 hover:bg-green-400 text-white text-xl font-bold shadow-[0_0_30px_rgba(34,197,94,0.5)] flex items-center gap-2"
          >
            <PhoneIcon className="w-6 h-6" /> Simulate morning call
          </button>
        </div>

        {/* Conversation */}
        <div className="mt-8 space-y-3">
          {msgs.slice(-6).map((m, i) =>
            m.role === "agent" ? (
              <div key={i} className="bg-white/10 backdrop-blur rounded-3xl p-5 text-2xl leading-relaxed ring-1 ring-white/10">
                {m.text}
              </div>
            ) : (
              <div key={i} className="ml-16 bg-indigo-500 rounded-3xl p-4 text-xl text-right">
                {m.text}
              </div>
            )
          )}
        </div>
      </div>

      {/* Bottom dock */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#050418] via-[#0f0d2e] to-transparent pt-8 pb-4 px-4">
        <div className="max-w-xl mx-auto space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => send("Yes, I took my morning pill")} className="py-4 rounded-2xl bg-green-500 hover:bg-green-400 text-white text-xl font-bold flex items-center justify-center gap-2">
              <CheckIcon className="w-6 h-6" /> Yes
            </button>
            <button onClick={voiceInput} className={`py-4 rounded-2xl text-white text-xl font-bold flex items-center justify-center gap-2 ${phase === "listening" ? "bg-red-500 animate-pulse" : "bg-indigo-600 hover:bg-indigo-500"}`}>
              <MicIcon className="w-6 h-6" /> Speak
            </button>
            <button onClick={() => send("I feel lonely, can you keep me company?")} className="py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white text-xl font-bold flex items-center justify-center gap-2">
              <ChatIcon className="w-6 h-6" /> Talk
            </button>
          </div>
          <BeamInput value={input} onChange={setInput} onSend={() => send(input)} onMic={voiceInput} micActive={phase === "listening"} />
        </div>
      </div>
    </main>
  );
}
