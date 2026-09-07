import { dbOn, ready, q } from "./db";
import { MEDS, MEMORIES, STATE, getState } from "./demo-data";
import { randomId } from "./crypto";

// Unified persistence: Postgres when DATABASE_URL is set, in-memory demo
// store otherwise. All agent tools + routes go through here.

export type Med = { id: string; name: string; dosage: string; time: string; label: string; active: boolean; pills_left?: number };
export type Escalation = { level: string; message: string; time: string };
export type BgTask = { id: string; userId: string; instruction: string; runAt: string; status: string; result?: string };
export type ChatMessage = {
  id: string | number;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  channel: string;
  createdAt: string;
};

const MEM_TASKS: BgTask[] = [];
const MEM_CHAT: ChatMessage[] = [];

function fmtTime(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ---------- durable chat history ----------
export async function saveChatMessage(threadId: string, role: ChatMessage["role"], content: string, channel = "chat"): Promise<ChatMessage> {
  const createdAt = new Date().toISOString();
  if (!dbOn()) {
    const row = { id: randomId("msg"), threadId, role, content, channel, createdAt };
    MEM_CHAT.push(row);
    return row;
  }
  await ready();
  const rows = await q<{ id: string; thread_id: string; role: ChatMessage["role"]; content: string; channel: string; created_at: string }>(
    "insert into chat_messages(thread_id,role,content,channel) values($1,$2,$3,$4) returning id,thread_id,role,content,channel,created_at",
    [threadId, role, content, channel]
  );
  const row = rows[0];
  return { id: row.id, threadId: row.thread_id, role: row.role, content: row.content, channel: row.channel, createdAt: new Date(row.created_at).toISOString() };
}

export async function listChatMessages(threadId: string, limit = 80): Promise<ChatMessage[]> {
  if (!dbOn()) return MEM_CHAT.filter((m) => m.threadId === threadId).slice(-limit);
  await ready();
  const rows = await q<{ id: string; thread_id: string; role: ChatMessage["role"]; content: string; channel: string; created_at: string }>(
    "select id,thread_id,role,content,channel,created_at from chat_messages where thread_id=$1 order by created_at desc limit $2",
    [threadId, limit]
  );
  return rows.reverse().map((row) => ({ id: row.id, threadId: row.thread_id, role: row.role, content: row.content, channel: row.channel, createdAt: new Date(row.created_at).toISOString() }));
}

// ---------- medications ----------
export async function listMeds(elder = "eleanor-79"): Promise<Med[]> {
  if (!dbOn()) return MEDS.map((m) => ({ id: m.id, name: m.name.split(" ")[0], dosage: m.name.split(" ").slice(1).join(" "), time: m.time, label: m.label, active: true, pills_left: 30 }));
  await ready();
  const rows = await q<Med>("select id,name,dosage,time,label,active,pills_left from medications where elder_id=$1 order by time", [elder]);
  return rows;
}

export async function addMed(elder: string, m: { name: string; dosage: string; time: string; label: string; pills_left?: number }): Promise<Med> {
  await ready();
  const id = randomId("med");
  const rows = await q<Med>("insert into medications(id,elder_id,name,dosage,time,label,pills_left) values($1,$2,$3,$4,$5,$6,$7) returning id,name,dosage,time,label,active,pills_left", [
    id, elder, m.name.trim(), m.dosage.trim(), m.time, m.label.trim(), m.pills_left ?? 30,
  ]);
  return rows[0];
}

export async function updateMed(id: string, patch: Partial<Pick<Med, "name" | "dosage" | "time" | "label" | "active" | "pills_left">>): Promise<Med | null> {
  await ready();
  const cur = await q<Med>("select id,name,dosage,time,label,active,pills_left from medications where id=$1", [id]);
  if (!cur.length) return null;
  const m = { ...cur[0], ...patch };
  const rows = await q<Med>("update medications set name=$1,dosage=$2,time=$3,label=$4,active=$5,pills_left=$6 where id=$7 returning id,name,dosage,time,label,active,pills_left", [
    m.name, m.dosage, m.time, m.label, m.active, m.pills_left ?? 30, id,
  ]);
  return rows[0];
}

export async function deleteMed(id: string) {
  await ready();
  await q("delete from medications where id=$1", [id]);
}

// ---------- intakes / adherence (today) ----------
export async function takenMedIds(elder = "eleanor-79"): Promise<string[]> {
  if (!dbOn()) return Object.keys(getState(elder).intakes);
  await ready();
  const rows = await q<{ med_id: string }>("select med_id from intakes where elder_id=$1 and taken_at::date = current_date", [elder]);
  return rows.map((r) => r.med_id);
}

export async function confirmIntake(elder: string, medId: string, source = "chat"): Promise<number> {
  if (!dbOn()) {
    getState(elder).intakes[medId] = new Date().toISOString();
    return Object.keys(getState(elder).intakes).length;
  }
  await ready();
  await q("insert into intakes(elder_id,med_id,source) values($1,$2,$3)", [elder, medId, source]);
  await q("update medications set pills_left = greatest(0, pills_left - 1) where id=$1", [medId]);
  return (await takenMedIds(elder)).length;
}

// ---------- symptoms (passive catching) ----------
export async function logSymptom(elder: string, complaint: string, detail = "") {
  if (!dbOn()) return { complaint, detail, at: new Date().toISOString() };
  await ready();
  const rows = await q("insert into symptoms(elder_id,complaint,detail) values($1,$2,$3) returning complaint,detail,at", [elder, complaint, detail]);
  return rows[0];
}

export async function symptomMentions(elder: string, complaint: string, days = 7): Promise<number> {
  if (!dbOn()) return 1;
  await ready();
  const rows = await q<{ n: string }>(
    "select count(*) n from symptoms where elder_id=$1 and lower(complaint)=lower($2) and at >= now() - ($3 || ' days')::interval",
    [elder, complaint, String(days)]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listSymptoms(elder = "eleanor-79", n = 10) {
  if (!dbOn()) return [];
  await ready();
  return q("select complaint,detail,at from symptoms where elder_id=$1 order by at desc limit $2", [elder, n]);
}

// ---------- refills (honest math: 1 pill/day from logged intakes) ----------
export async function refillStatus(elder = "eleanor-79") {
  const meds = (await listMeds(elder)).filter((m) => m.active);
  return meds.map((m) => ({
    id: m.id, name: `${m.name} ${m.dosage}`.trim(),
    pillsLeft: m.pills_left ?? 30,
    daysLeft: m.pills_left ?? 30,
    low: (m.pills_left ?? 30) <= 7,
  }));
}

// ---------- moods ----------
export async function logMood(elder: string, mood: string, note = "") {
  if (!dbOn()) {
    getState(elder).moods.push({ mood, note, at: new Date().toISOString() });
    return;
  }
  await ready();
  await q("insert into moods(elder_id,mood,note) values($1,$2,$3)", [elder, mood, note]);
}

export async function lastMood(elder = "eleanor-79"): Promise<string> {
  if (!dbOn()) {
    const ms = getState(elder).moods;
    return ms.length ? ms[ms.length - 1].mood : "ok";
  }
  await ready();
  const rows = await q<{ mood: string }>("select mood from moods where elder_id=$1 order by at desc limit 1", [elder]);
  return rows[0]?.mood ?? "ok";
}

export async function listMoods(elder = "eleanor-79", n = 5): Promise<{ mood: string; note?: string; at?: string }[]> {
  if (!dbOn()) return getState(elder).moods.slice(-n);
  await ready();
  return q("select mood,note,at from moods where elder_id=$1 order by at desc limit $2", [elder, n]);
}

// ---------- memories ----------
export async function listMemories(elder = "eleanor-79"): Promise<{ title: string; note: string }[]> {
  if (!dbOn()) return MEMORIES;
  await ready();
  return q("select title,note from memories where elder_id=$1 order by id", [elder]);
}

export async function addMemory(elder: string, title: string, note: string) {
  await ready();
  await q("insert into memories(elder_id,title,note) values($1,$2,$3)", [elder, title, note]);
}

// ---------- escalations ----------
export type EscalationRow = Escalation & { id?: number; acked?: boolean };

export async function addEscalation(elder: string, level: string, message: string): Promise<EscalationRow> {
  const e: Escalation = { level, message, time: fmtTime(new Date()) };
  if (!dbOn()) {
    getState(elder).escalations.push(e);
    return e;
  }
  await ready();
  const rows = await q<{ id: number }>("insert into escalations(elder_id,level,message) values($1,$2,$3) returning id", [elder, level, message]);
  return { ...e, id: rows[0].id, acked: false };
}

export async function listEscalations(elder = "eleanor-79", n = 10): Promise<EscalationRow[]> {
  if (!dbOn()) return [...getState(elder).escalations].reverse().slice(0, n);
  await ready();
  const rows = await q<{ id: number; level: string; message: string; at: string; acked: boolean }>("select id,level,message,at,acked from escalations where elder_id=$1 order by at desc limit $2", [elder, n]);
  return rows.map((r) => ({ id: r.id, level: r.level, message: r.message, time: fmtTime(r.at), acked: r.acked }));
}

export async function ackEscalation(id: number) {
  await ready();
  await q("update escalations set acked=true where id=$1", [id]);
}

export async function unackedUrgentOlderThan(minutes: number, elder = "eleanor-79") {
  await ready();
  return q<{ id: number; level: string; message: string; at: string }>(
    "select id,level,message,at from escalations where elder_id=$1 and acked=false and level in ('attention','urgent') and at < now() - ($2 || ' minutes')::interval order by at",
    [elder, String(minutes)]
  );
}

// ---------- heartbeats (is she still there?) ----------
export async function heartbeat(elder: string, kind = "chat") {
  if (!dbOn()) return;
  await ready();
  await q("insert into heartbeats(elder_id,kind) values($1,$2)", [elder, kind]);
}

export async function lastHeartbeat(elder = "eleanor-79"): Promise<{ at: string; minutesAgo: number } | null> {
  if (!dbOn()) return null;
  await ready();
  const rows = await q<{ at: string }>("select at from heartbeats where elder_id=$1 order by at desc limit 1", [elder]);
  if (!rows.length) return null;
  const at = new Date(rows[0].at);
  return { at: at.toISOString(), minutesAgo: Math.round((Date.now() - at.getTime()) / 60000) };
}

// ---------- background tasks ----------
export async function enqueueTask(userId: string, instruction: string, runAt: Date): Promise<BgTask> {
  if (!dbOn()) {
    const t: BgTask = { id: randomId("task"), userId, instruction, runAt: runAt.toISOString(), status: "pending" };
    MEM_TASKS.unshift(t);
    return t;
  }
  await ready();
  const rows = await q<{ id: string; run_at: string; status: string }>(
    "insert into tasks(id,elder_id,instruction,run_at) values($1,$2,$3,$4) returning id,run_at,status",
    [randomId("task"), userId, instruction, runAt.toISOString()]
  );
  return { id: rows[0].id, userId, instruction, runAt: new Date(rows[0].run_at).toISOString(), status: rows[0].status };
}

export async function listTasks(userId?: string): Promise<BgTask[]> {
  if (!dbOn()) return (userId ? MEM_TASKS.filter((t) => t.userId === userId) : MEM_TASKS).slice(0, 20);
  await ready();
  const rows = await q<{ id: string; elder_id: string; instruction: string; run_at: string; status: string; result: string }>(
    userId ? "select id,elder_id,instruction,run_at,status,result from tasks where elder_id=$1 order by created_at desc limit 20"
           : "select id,elder_id,instruction,run_at,status,result from tasks order by created_at desc limit 20",
    userId ? [userId] : []
  );
  return rows.map((r) => ({ id: r.id, userId: r.elder_id, instruction: r.instruction, runAt: new Date(r.run_at).toISOString(), status: r.status, result: r.result || undefined }));
}

export async function getTask(id: string): Promise<BgTask | undefined> {
  if (!dbOn()) return MEM_TASKS.find((t) => t.id === id);
  await ready();
  const rows = await q<{ id: string; elder_id: string; instruction: string; run_at: string; status: string; result: string }>(
    "select id,elder_id,instruction,run_at,status,result from tasks where id=$1", [id]
  );
  const r = rows[0];
  return r && { id: r.id, userId: r.elder_id, instruction: r.instruction, runAt: new Date(r.run_at).toISOString(), status: r.status, result: r.result || undefined };
}

export async function updateTask(id: string, patch: Partial<Pick<BgTask, "status" | "result">>) {
  if (!dbOn()) {
    const t = MEM_TASKS.find((t) => t.id === id);
    if (t) Object.assign(t, patch);
    return t;
  }
  await ready();
  if (patch.status !== undefined) await q("update tasks set status=$1 where id=$2", [patch.status, id]);
  if (patch.result !== undefined) await q("update tasks set result=$1 where id=$2", [patch.result, id]);
  return getTask(id);
}

// ---------- reports ----------
export async function saveReport(elder: string, dateISO: string, channel: string, summary: string) {
  if (!dbOn()) return;
  await ready();
  await q("insert into reports(elder_id,date,channel,summary) values($1,$2,$3,$4)", [elder, dateISO, channel, summary]);
}

export async function listReports(elder = "eleanor-79", n = 7) {
  if (!dbOn()) return [];
  await ready();
  return q("select date,channel,summary,created_at from reports where elder_id=$1 order by created_at desc limit $2", [elder, n]);
}

// ---------- appointments ----------
export type Appt = { id: string; title: string; doctor: string; location: string; at: string; notes: string; status: string; google_event_id?: string };
const MEM_APPTS: (Appt & { elderId?: string })[] = [];

export async function listAppointments(elder = "eleanor-79", upcomingOnly = true): Promise<Appt[]> {
  if (!dbOn()) {
    const rows = MEM_APPTS.filter((a) => a.elderId === elder || !a.elderId);
    return rows.filter((a) => !upcomingOnly || (a.status === "upcoming" || a.status === "proposed") && new Date(a.at).getTime() >= Date.now() - 86_400_000).sort((a, b) => +new Date(a.at) - +new Date(b.at));
  }
  await ready();
  return q(
    upcomingOnly
      ? "select id,title,doctor,location,at,notes,status,google_event_id from appointments where elder_id=$1 and status in ('upcoming','proposed') and at >= now() - interval '1 day' order by at"
      : "select id,title,doctor,location,at,notes,status,google_event_id from appointments where elder_id=$1 order by at desc limit 30",
    [elder]
  );
}

export async function addAppointment(elder: string, a: { title: string; doctor: string; location: string; at: string; notes: string }, status = "upcoming"): Promise<Appt> {
  const id = randomId("appt");
  if (!dbOn()) {
    const appt = { id, elderId: elder, title: a.title, doctor: a.doctor, location: a.location, at: a.at, notes: a.notes, status };
    MEM_APPTS.unshift(appt);
    return appt;
  }
  await ready();
  const rows = await q<Appt>("insert into appointments(id,elder_id,title,doctor,location,at,notes,status) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,title,doctor,location,at,notes,status,google_event_id",
    [id, elder, a.title, a.doctor, a.location, a.at, a.notes, status]);
  return rows[0];
}

export async function getAppointment(id: string): Promise<Appt | null> {
  if (!dbOn()) return MEM_APPTS.find((a) => a.id === id) ?? null;
  await ready();
  const rows = await q<Appt>("select id,title,doctor,location,at,notes,status,google_event_id from appointments where id=$1", [id]);
  return rows[0] ?? null;
}

export async function setAppointment(id: string, patch: Partial<Pick<Appt, "status" | "title" | "at" | "notes">>): Promise<Appt | null> {
  if (!dbOn()) {
    const appt = MEM_APPTS.find((a) => a.id === id);
    if (!appt) return null;
    Object.assign(appt, patch);
    return appt;
  }
  await ready();
  const cur = await q<Appt>("select id,title,doctor,location,at,notes,status,google_event_id from appointments where id=$1", [id]);
  if (!cur.length) return null;
  const m = { ...cur[0], ...patch };
  const rows = await q<Appt>("update appointments set title=$1,at=$2,notes=$3,status=$4 where id=$5 returning id,title,doctor,location,at,notes,status,google_event_id",
    [m.title, m.at, m.notes, m.status, id]);
  return rows[0];
}

export async function deleteAppointment(id: string) {
  if (!dbOn()) {
    const index = MEM_APPTS.findIndex((a) => a.id === id);
    if (index >= 0) MEM_APPTS.splice(index, 1);
    return;
  }
  await ready();
  await q("delete from appointments where id=$1", [id]);
}

// ---------- health metrics ----------
export type Metric = { type: string; value: number; unit: string; at: string; source: string };

export async function logHealth(elder: string, type: string, value: number, unit = "", source = "manual"): Promise<Metric> {
  await ready();
  const rows = await q<Metric>("insert into health_metrics(elder_id,type,value,unit,source) values($1,$2,$3,$4,$5) returning type,value,unit,at,source",
    [elder, type, value, unit, source]);
  return rows[0];
}

export async function listHealth(elder = "eleanor-79", type?: string, n = 30): Promise<Metric[]> {
  if (!dbOn()) return [];
  await ready();
  return type
    ? q("select type,value,unit,at,source from health_metrics where elder_id=$1 and type=$2 order by at desc limit $3", [elder, type, n])
    : q("select type,value,unit,at,source from health_metrics where elder_id=$1 order by at desc limit $2", [elder, n]);
}

export async function healthTrends(elder = "eleanor-79") {
  if (!dbOn()) return { latest: {}, weekAvg: {}, readings7d: 0 };
  await ready();
  const latest = await q<{ type: string; value: number; unit: string; at: string }>(
    "select distinct on (type) type,value,unit,at from health_metrics where elder_id=$1 order by type,at desc", [elder]);
  const avg = await q<{ type: string; avg: number; n: number }>(
    "select type,avg(value),count(*) n from health_metrics where elder_id=$1 and at >= now() - interval '7 days' group by type", [elder]);
  const latestMap: Record<string, { value: number; unit: string; at: string }> = {};
  for (const r of latest) latestMap[r.type] = { value: r.value, unit: r.unit, at: new Date(r.at).toISOString() };
  const avgMap: Record<string, { avg: number; n: number }> = {};
  for (const r of avg) avgMap[r.type] = { avg: Math.round(Number(r.avg) * 10) / 10, n: Number(r.n) };
  return { latest: latestMap, weekAvg: avgMap, readings7d: avg.reduce((s, r) => s + Number(r.n), 0) };
}

// ---------- users (auth) ----------
export async function createUser(name: string, email: string, passwordHash: string, role: string) {
  if (!dbOn()) throw new Error("database not configured (set DATABASE_URL)");
  await ready();
  const rows = await q<{ id: number; name: string; email: string; role: string }>(
    "insert into users(name,email,password_hash,role) values($1,$2,$3,$4) returning id,name,email,role",
    [name, email, passwordHash, role]
  );
  return rows[0];
}

export async function getUserByEmail(email: string) {
  if (!dbOn()) throw new Error("database not configured (set DATABASE_URL)");
  await ready();
  const rows = await q<{ id: number; name: string; email: string; role: string; password_hash: string }>(
    "select id,name,email,role,password_hash from users where email=$1", [email]
  );
  return rows[0];
}
