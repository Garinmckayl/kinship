import { dbOn, ready, q } from "./db";
import { MEDS, MEMORIES, STATE, getState } from "./demo-data";
import { randomId } from "./crypto";

// Unified persistence: Postgres when DATABASE_URL is set, in-memory demo
// store otherwise. All agent tools + routes go through here.

export type Med = { id: string; name: string; dosage: string; time: string; label: string; active: boolean };
export type Escalation = { level: string; message: string; time: string };
export type BgTask = { id: string; userId: string; instruction: string; runAt: string; status: string; result?: string };

const MEM_TASKS: BgTask[] = [];

function fmtTime(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ---------- medications ----------
export async function listMeds(elder = "ruth-78"): Promise<Med[]> {
  if (!dbOn()) return MEDS.map((m) => ({ id: m.id, name: m.name.split(" ")[0], dosage: m.name.split(" ").slice(1).join(" "), time: m.time, label: m.label, active: true }));
  await ready();
  const rows = await q<Med>("select id,name,dosage,time,label,active from medications where elder_id=$1 order by time", [elder]);
  return rows;
}

export async function addMed(elder: string, m: { name: string; dosage: string; time: string; label: string }): Promise<Med> {
  await ready();
  const id = randomId("med");
  const rows = await q<Med>("insert into medications(id,elder_id,name,dosage,time,label) values($1,$2,$3,$4,$5,$6) returning id,name,dosage,time,label,active", [
    id, elder, m.name.trim(), m.dosage.trim(), m.time, m.label.trim(),
  ]);
  return rows[0];
}

export async function updateMed(id: string, patch: Partial<Pick<Med, "name" | "dosage" | "time" | "label" | "active">>): Promise<Med | null> {
  await ready();
  const cur = await q<Med>("select id,name,dosage,time,label,active from medications where id=$1", [id]);
  if (!cur.length) return null;
  const m = { ...cur[0], ...patch };
  const rows = await q<Med>("update medications set name=$1,dosage=$2,time=$3,label=$4,active=$5 where id=$6 returning id,name,dosage,time,label,active", [
    m.name, m.dosage, m.time, m.label, m.active, id,
  ]);
  return rows[0];
}

export async function deleteMed(id: string) {
  await ready();
  await q("delete from medications where id=$1", [id]);
}

// ---------- intakes / adherence (today) ----------
export async function takenMedIds(elder = "ruth-78"): Promise<string[]> {
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
  return (await takenMedIds(elder)).length;
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

export async function lastMood(elder = "ruth-78"): Promise<string> {
  if (!dbOn()) {
    const ms = getState(elder).moods;
    return ms.length ? ms[ms.length - 1].mood : "ok";
  }
  await ready();
  const rows = await q<{ mood: string }>("select mood from moods where elder_id=$1 order by at desc limit 1", [elder]);
  return rows[0]?.mood ?? "ok";
}

export async function listMoods(elder = "ruth-78", n = 5): Promise<{ mood: string; note?: string; at?: string }[]> {
  if (!dbOn()) return getState(elder).moods.slice(-n);
  await ready();
  return q("select mood,note,at from moods where elder_id=$1 order by at desc limit $2", [elder, n]);
}

// ---------- memories ----------
export async function listMemories(elder = "ruth-78"): Promise<{ title: string; note: string }[]> {
  if (!dbOn()) return MEMORIES;
  await ready();
  return q("select title,note from memories where elder_id=$1 order by id", [elder]);
}

export async function addMemory(elder: string, title: string, note: string) {
  await ready();
  await q("insert into memories(elder_id,title,note) values($1,$2,$3)", [elder, title, note]);
}

// ---------- escalations ----------
export async function addEscalation(elder: string, level: string, message: string): Promise<Escalation> {
  const e: Escalation = { level, message, time: fmtTime(new Date()) };
  if (!dbOn()) {
    getState(elder).escalations.push(e);
    return e;
  }
  await ready();
  await q("insert into escalations(elder_id,level,message) values($1,$2,$3)", [elder, level, message]);
  return e;
}

export async function listEscalations(elder = "ruth-78", n = 10): Promise<Escalation[]> {
  if (!dbOn()) return [...getState(elder).escalations].reverse().slice(0, n);
  await ready();
  const rows = await q<{ level: string; message: string; at: string }>("select level,message,at from escalations where elder_id=$1 order by at desc limit $2", [elder, n]);
  return rows.map((r) => ({ level: r.level, message: r.message, time: fmtTime(r.at) }));
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

export async function listReports(elder = "ruth-78", n = 7) {
  if (!dbOn()) return [];
  await ready();
  return q("select date,channel,summary,created_at from reports where elder_id=$1 order by created_at desc limit $2", [elder, n]);
}

// ---------- users (auth) ----------
export async function createUser(name: string, email: string, passwordHash: string, role: string) {
  await ready();
  const rows = await q<{ id: number; name: string; email: string; role: string }>(
    "insert into users(name,email,password_hash,role) values($1,$2,$3,$4) returning id,name,email,role",
    [name, email, passwordHash, role]
  );
  return rows[0];
}

export async function getUserByEmail(email: string) {
  await ready();
  const rows = await q<{ id: number; name: string; email: string; role: string; password_hash: string }>(
    "select id,name,email,role,password_hash from users where email=$1", [email]
  );
  return rows[0];
}
