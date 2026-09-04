"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BorderBeam } from "border-beam";
import { HeartIcon } from "@/components/icons";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  async function submit() {
    setErr("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setErr(data.error ?? "Login failed");
    router.push("/family");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#312e81_0%,#0f0d2e_55%,#050418_100%)] text-white grid place-items-center px-5">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <HeartIcon className="w-10 h-10 mx-auto text-rose-400" />
          <h1 className="text-3xl font-bold">Caregiver login</h1>
          <p className="text-slate-400">Demo: caregiver@demo.local / demo1234</p>
        </div>
        <BorderBeam size="md" colorVariant="ocean" theme="dark">
          <div className="bg-slate-950/90 rounded-2xl p-6 space-y-4">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
              className="w-full bg-white/5 ring-1 ring-white/10 rounded-xl px-4 py-3 text-lg outline-none placeholder:text-slate-500" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Password" type="password"
              className="w-full bg-white/5 ring-1 ring-white/10 rounded-xl px-4 py-3 text-lg outline-none placeholder:text-slate-500" />
            {err && <p className="text-red-300">{err}</p>}
            <button onClick={submit} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-lg">Log in</button>
          </div>
        </BorderBeam>
        <p className="text-center text-slate-400">No account? <Link href="/signup" className="text-indigo-300 underline">Sign up</Link></p>
      </div>
    </main>
  );
}
