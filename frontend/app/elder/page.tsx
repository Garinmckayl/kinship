"use client";
import { useState } from "react";

type Msg = { role: "agent" | "elder"; text: string };
const API = "/api";

export default function ElderPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Good morning Ruth 💜 Did you take your Lisinopril (morning pill)? Tap Yes or Speak." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: "elder", text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "ruth-78", message: text }),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { role: "agent", text: data.reply ?? "I'm here with you." }]);
      if (data.speak) speak(data.reply);
    } catch {
      setMsgs((m) => [...m, { role: "agent", text: "(offline demo) Logged. Your family will be notified only if needed. 💜" }]);
    }
    setLoading(false);
  }

  // ElevenLabs voice first (warm guardian), browser TTS as fallback.
  async function speak(text: string) {
    try {
      const res = await fetch(`${API}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok && res.headers.get("Content-Type")?.includes("audio")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => browserSpeak(text));
        return;
      }
    } catch {}
    browserSpeak(text);
  }

  function browserSpeak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch {}
  }

  function voiceInput() {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return alert("Voice not supported in this browser — type instead.");
    const rec = new SR();
    rec.lang = "en-US";
    rec.onresult = (e: any) => send(e.results[0][0].transcript);
    rec.start();
  }

  return (
    <main className="max-w-xl mx-auto p-4 pb-32 min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <header className="text-center py-4">
        <h1 className="text-3xl font-bold">💜 Hi Ruth</h1>
        <p className="text-slate-600 text-lg">I'm here with you today</p>
      </header>

      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "agent" ? "bg-white rounded-3xl p-5 shadow text-xl leading-relaxed" : "ml-12 bg-indigo-600 text-white rounded-3xl p-4 text-xl"}>
            {m.text}
          </div>
        ))}
        {loading && <p className="text-slate-400 text-lg animate-pulse">ElderLove is thinking…</p>}
      </div>

      {/* Big elder-friendly actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-xl mx-auto grid grid-cols-3 gap-3 mb-3">
          <button onClick={() => send("Yes, I took my morning pill")} className="py-4 rounded-2xl bg-green-600 text-white text-xl font-bold">✅ Yes</button>
          <button onClick={voiceInput} className="py-4 rounded-2xl bg-indigo-600 text-white text-xl font-bold">🎤 Speak</button>
          <button onClick={() => send("I feel lonely, can you keep me company?")} className="py-4 rounded-2xl bg-amber-500 text-white text-xl font-bold">💬 Talk</button>
        </div>
        <div className="max-w-xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Type here… (large text)"
            className="flex-1 border-2 rounded-2xl px-4 py-3 text-xl"
          />
          <button onClick={() => send(input)} className="px-6 rounded-2xl bg-slate-900 text-white text-xl">Send</button>
        </div>
      </div>
    </main>
  );
}
