import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-8 text-center space-y-6">
      <h1 className="text-4xl font-bold">💜 ElderLove</h1>
      <p className="text-lg text-slate-600">
        Autonomous guardian agent for elders. Runs quietly in the background,
        only pings family when it matters.
      </p>
      <p className="text-sm text-slate-500">
        Built with Strands Agents SDK + Amazon Bedrock AgentCore | Agents for Humans Hackathon
      </p>
      <div className="flex gap-4 justify-center pt-4">
        <Link href="/elder" className="px-8 py-4 rounded-2xl bg-indigo-600 text-white text-xl font-semibold">
          Elder View 👵
        </Link>
        <Link href="/family" className="px-8 py-4 rounded-2xl bg-white border-2 border-indigo-600 text-indigo-700 text-xl font-semibold">
          Family Dashboard 👨‍👩‍👧
        </Link>
      </div>
      <div className="pt-8 text-left bg-white rounded-2xl p-6 shadow text-sm space-y-2">
        <p><b>Demo persona:</b> Ruth, 78, lives alone, 3 meds.</p>
        <p><b>Loop:</b> morning check-in → med confirm → mood scan → memory moment → escalate only if needed.</p>
        <p className="text-slate-500">Single codebase: Next.js PWA + Strands TS SDK in <code>/api/chat</code>. No separate backend.</p>
      </div>
    </main>
  );
}
