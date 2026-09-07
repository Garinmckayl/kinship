// ElderLove guardian on Bedrock AgentCore Runtime (TypeScript).
// Mirrors frontend/lib/guardian.ts tools against the same Postgres.
// Contract per Strands AgentCore TS docs: GET /ping, POST /invocations (raw body).
import { z } from "zod";
import * as strands from "@strands-agents/sdk";
import express, { type Request, type Response } from "express";
import { Pool } from "pg";

const PORT = Number(process.env.PORT || 8080);
const REGION = process.env.AWS_REGION || "us-west-2";

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL ?? "").replace(/&?channel_binding=require/, ""),
  ssl: { rejectUnauthorized: false },
});
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params as unknown[])).rows;

const getMeds = strands.tool({
  name: "get_med_schedule",
  description: "Today's medication schedule + pending for an elder.",
  inputSchema: z.object({ userId: z.string() }),
  callback: async (input) => {
    const meds = await q("select id,name,dosage,time,label from medications where elder_id=$1 and active order by time", [input.userId]);
    const taken = await q("select med_id from intakes where elder_id=$1 and taken_at::date=current_date", [input.userId]);
    const takenIds = new Set(taken.map((t) => (t as { med_id: string }).med_id));
    return JSON.stringify({ all: meds, pending: meds.filter((m) => !takenIds.has((m as { id: string }).id)), takenCount: takenIds.size });
  },
});

const confirm = strands.tool({
  name: "confirm_intake",
  description: "Log a taken medication.",
  inputSchema: z.object({ userId: z.string(), medId: z.string() }),
  callback: async (input) => {
    await q("insert into intakes(elder_id,med_id,source) values($1,$2,'agentcore')", [input.userId, input.medId]);
    return JSON.stringify({ ok: true });
  },
});

const mood = strands.tool({
  name: "log_mood",
  description: "Log mood: lonely, happy, anxious, confused, sad, ok.",
  inputSchema: z.object({ userId: z.string(), mood: z.string(), note: z.string().optional() }),
  callback: async (input) => {
    await q("insert into moods(elder_id,mood,note) values($1,$2,$3)", [input.userId, input.mood, input.note ?? ""]);
    return JSON.stringify({ ok: true });
  },
});

const memory = strands.tool({
  name: "retrieve_memory",
  description: "Fetch a comforting memory.",
  inputSchema: z.object({ userId: z.string() }),
  callback: async (input) => {
    const mems = await q("select title,note from memories where elder_id=$1 order by id", [input.userId]);
    return JSON.stringify((mems[0] as unknown) ?? { title: "quiet afternoon", note: "Sitting together, no rush." });
  },
});

const escalate = strands.tool({
  name: "notify_family",
  description: "Escalate: info | attention | urgent.",
  inputSchema: z.object({ userId: z.string(), level: z.enum(["info", "attention", "urgent"]), message: z.string() }),
  callback: async (input) => {
    await q("insert into escalations(elder_id,level,message) values($1,$2,$3)", [input.userId, input.level, input.message]);
    console.log(`[ESCALATE ${input.level}] ${input.userId}: ${input.message}`);
    return JSON.stringify({ ok: true });
  },
});

const agent = new strands.Agent({
  model: new strands.BedrockModel({ region: REGION }),
  systemPrompt: "You are ElderLove, a warm patient guardian for elders living alone. Remind and log medications (never diagnose). Escalate urgent issues. Speak simply.",
  tools: [getMeds, confirm, mood, memory, escalate],
  printer: false,
  contextManager: "auto",
});

const app = express();
app.get("/ping", (_req: Request, res: Response) =>
  res.json({ status: "Healthy", time_of_last_update: Math.floor(Date.now() / 1000) })
);
app.post("/invocations", express.raw({ type: "*/*" }), async (req: Request, res: Response) => {
  try {
    // AgentCore may deliver Buffer, string, or a parsed/wrapped object — normalize.
    const b = req.body as unknown;
    let raw: string;
    if (Buffer.isBuffer(b)) raw = new TextDecoder().decode(b);
    else if (typeof b === "string") raw = b;
    else raw = JSON.stringify(b ?? {});
    let prompt = raw;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const inner = (parsed.input ?? parsed) as Record<string, unknown>;
      if (typeof inner.message === "string") {
        prompt = `[user ${String(inner.user_id ?? "eleanor-79")}] ${inner.message}`;
      } else if (typeof parsed.payload === "string") {
        // base64-wrapped payload variant
        const dec = Buffer.from(parsed.payload, "base64").toString("utf8");
        try {
          const p2 = JSON.parse(dec) as Record<string, unknown>;
          prompt = typeof p2.message === "string" ? `[user ${String(p2.user_id ?? "eleanor-79")}] ${p2.message}` : dec;
        } catch {
          prompt = dec;
        }
      }
    } catch { /* plain-text prompt */ }
    const result = await agent.invoke(prompt);
    const last = (result as { lastMessage?: unknown }).lastMessage;
    return res.json({ response: typeof last === "string" ? last : JSON.stringify(last) });
  } catch (err) {
    console.error("invocation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`ElderLove AgentCore listening on :${PORT}`));
