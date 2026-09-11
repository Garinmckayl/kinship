import { Pool } from "pg";
import { hashPassword } from "./crypto";
import { MEDS, MEMORIES } from "./demo-data";

let pool: Pool | null = null;

export function dbOn() {
  return !!process.env.DATABASE_URL;
}

export function getPool(): Pool {
  if (!pool) {
    // pg lacks SCRAM channel-binding; Neon pooler works with plain SSL.
    const cs = (process.env.DATABASE_URL ?? "").replace(/&?channel_binding=require/, "");
    pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await getPool().query(text, params as unknown[]);
  return rows as T[];
}

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'caregiver',
  created_at timestamptz default now()
);
create table if not exists elders (
  id text primary key,
  name text not null,
  age int default 0,
  phone text default '',
  whatsapp text default '',
  created_at timestamptz default now()
);
create table if not exists medications (
  id text primary key,
  elder_id text not null references elders(id) on delete cascade,
  name text not null,
  dosage text default '',
  time text not null,
  label text default '',
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists intakes (
  id serial primary key,
  elder_id text not null,
  med_id text not null,
  taken_at timestamptz default now(),
  intake_date date not null default current_date,
  source text default 'chat'
);
create table if not exists moods (
  id serial primary key,
  elder_id text not null,
  mood text not null,
  note text default '',
  at timestamptz default now()
);
create table if not exists memories (
  id serial primary key,
  elder_id text not null,
  title text not null,
  note text default ''
);
create table if not exists escalations (
  id serial primary key,
  elder_id text not null,
  level text not null,
  message text not null,
  at timestamptz default now()
);
create table if not exists tasks (
  id text primary key,
  elder_id text not null,
  instruction text not null,
  run_at timestamptz not null,
  status text default 'pending',
  result text default '',
  created_at timestamptz default now()
);
create table if not exists reports (
  id serial primary key,
  elder_id text not null,
  date date not null,
  channel text not null,
  summary text not null,
  created_at timestamptz default now()
);
create table if not exists appointments (
  id text primary key,
  elder_id text not null,
  title text not null,
  doctor text default '',
  location text default '',
  at timestamptz not null,
  notes text default '',
  status text default 'upcoming',
  google_event_id text default '',
  created_at timestamptz default now()
);
create table if not exists health_metrics (
  id serial primary key,
  elder_id text not null,
  type text not null,
  value double precision not null,
  unit text default '',
  at timestamptz default now(),
  source text default 'manual'
);
create table if not exists heartbeats (
  id serial primary key,
  elder_id text not null,
  kind text default 'chat',
  at timestamptz default now()
);
create table if not exists symptoms (
  id serial primary key,
  elder_id text not null,
  complaint text not null,
  detail text default '',
  at timestamptz default now()
);
create table if not exists chat_messages (
  id bigserial primary key,
  thread_id text not null,
  role text not null,
  content text not null,
  channel text default 'chat',
  created_at timestamptz default now()
);
create index if not exists chat_messages_thread_time_idx on chat_messages(thread_id, created_at);
create table if not exists browser_tasks (
  id text primary key,
  elder_id text not null default 'eleanor-79',
  task_type text not null,
  status text default 'pending_approval',
  sidecar_task_id text,
  params jsonb default '{}',
  steps jsonb default '[]',
  result jsonb,
  error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create table if not exists dismissed_browser_tasks (
  id text primary key,
  task_id text not null,
  dismissed_at timestamptz default now()
);
`;

let readyP: Promise<void> | null = null;
export function ready(): Promise<void> {
  if (!readyP) readyP = init().catch((e) => { readyP = null; throw e; });
  return readyP;
}

async function init() {
  if (!dbOn()) return;
  await getPool().query(SCHEMA);
  // Migrations for pre-existing tables/rows.
  await getPool().query("alter table escalations add column if not exists acked boolean default false");
  await getPool().query("alter table intakes add column if not exists intake_date date");
  await getPool().query("update intakes set intake_date = (taken_at at time zone 'UTC')::date where intake_date is null");
  await getPool().query("alter table intakes alter column intake_date set default current_date");
  await getPool().query("alter table intakes alter column intake_date set not null");
  // Repair any legacy duplicate rows before enforcing the medication safety invariant.
  await getPool().query(`
    delete from intakes older using intakes newer
    where older.id > newer.id
      and older.elder_id = newer.elder_id
      and older.med_id = newer.med_id
      and older.intake_date = newer.intake_date
  `);
  await getPool().query("create unique index if not exists intakes_one_per_day_idx on intakes(elder_id,med_id,intake_date)");
  await getPool().query("alter table medications add column if not exists pills_left int default 30");
  await getPool().query("alter table browser_tasks add column if not exists sidecar_task_id text");
  // One-time persona rename: ruth-78 -> eleanor-79. Parent first (FK), then children.
  await getPool().query("insert into elders(id,name,age) values('eleanor-79','Eleanor',79) on conflict (id) do nothing");
  const tables = ["medications", "intakes", "moods", "memories", "escalations", "tasks", "reports", "appointments", "health_metrics", "heartbeats", "symptoms"];
  for (const t of tables) {
    await getPool().query(`update ${t} set elder_id='eleanor-79' where elder_id='ruth-78'`).catch(() => {});
  }
  await getPool().query("delete from elders where id='ruth-78'").catch(() => {});
  await seedDemo();
}

async function seedDemo() {
  const eu = await q("select id from users where email='caregiver@demo.local'");
  if (eu.length === 0) {
    await q("insert into users(name,email,password_hash,role) values($1,$2,$3,'caregiver')", [
      "Demo Caregiver",
      "caregiver@demo.local",
      await hashPassword("demo1234"),
    ]);
  }
  const ex = await q("select id from elders where id='eleanor-79'");
  if (ex.length === 0) {
    await q("insert into elders(id,name,age) values('eleanor-79','Eleanor',79)");
    for (const m of MEDS) {
      const parts = m.name.split(" ");
      await q("insert into medications(id,elder_id,name,dosage,time,label) values($1,'eleanor-79',$2,$3,$4,$5)", [
        m.id, parts[0], parts.slice(1).join(" "), m.time, m.label,
      ]);
    }
    for (const m of MEMORIES) {
      await q("insert into memories(elder_id,title,note) values('eleanor-79',$1,$2)", [m.title, m.note]);
    }
    await q("insert into escalations(elder_id,level,message) values('eleanor-79','info','Morning Lisinopril confirmed.')");
  }

  const healthCount = await q<{ count: string }>("select count(*) from health_metrics where elder_id='eleanor-79'");
  if (Number(healthCount[0]?.count ?? 0) === 0) {
    const days = [
      { sys: 132, dia: 78, heart: 72, steps: 4210, sleep: 7.2 },
      { sys: 134, dia: 80, heart: 74, steps: 3980, sleep: 6.9 },
      { sys: 131, dia: 79, heart: 71, steps: 4470, sleep: 7.4 },
      { sys: 136, dia: 81, heart: 76, steps: 3620, sleep: 6.7 },
      { sys: 139, dia: 82, heart: 78, steps: 3210, sleep: 6.5 },
      { sys: 142, dia: 84, heart: 80, steps: 2760, sleep: 6.3 },
      { sys: 146, dia: 86, heart: 82, steps: 1380, sleep: 6.1 },
    ];
    for (let index = 0; index < days.length; index += 1) {
      const day = days[index];
      const offset = days.length - index - 1;
      for (const [type, value, unit] of [
        ["blood_pressure_sys", day.sys, "mmHg"],
        ["blood_pressure_dia", day.dia, "mmHg"],
        ["heart_rate", day.heart, "bpm"],
        ["steps", day.steps, "steps"],
        ["sleep_hours", day.sleep, "hours"],
      ] as const) {
        await q(
          "insert into health_metrics(elder_id,type,value,unit,at,source) values('eleanor-79',$1,$2,$3,now()-($4 * interval '1 day'),'connected watch')",
          [type, value, unit, offset],
        );
      }
    }
  }

  const appointmentCount = await q<{ count: string }>("select count(*) from appointments where elder_id='eleanor-79' and status != 'cancelled'");
  if (Number(appointmentCount[0]?.count ?? 0) === 0) {
    await q(
      `insert into appointments(id,elder_id,title,doctor,location,at,notes,status)
       values('demo-followup','eleanor-79','Blood pressure follow-up','Dr. Harrison','Riverside Clinic',date_trunc('day',now())+interval '4 days 10 hours 30 minutes','Kinship connected a week-long upward trend to a routine follow-up.','upcoming')
       on conflict (id) do nothing`,
    );
    await q(
      `insert into appointments(id,elder_id,title,doctor,location,at,notes,status)
       values('demo-eye-exam','eleanor-79','Annual eye exam','Dr. Patel','Riverside Vision Center',date_trunc('day',now())+interval '10 days 9 hours','Requested by Eleanor; waiting for Sarah before booking.','proposed')
       on conflict (id) do nothing`,
    );
  }
}
