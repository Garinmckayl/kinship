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
`;

let readyP: Promise<void> | null = null;
export function ready(): Promise<void> {
  if (!readyP) readyP = init().catch((e) => { readyP = null; throw e; });
  return readyP;
}

async function init() {
  if (!dbOn()) return;
  await getPool().query(SCHEMA);
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
  const ex = await q("select id from elders where id='ruth-78'");
  if (ex.length === 0) {
    await q("insert into elders(id,name,age) values('ruth-78','Ruth',78)");
    for (const m of MEDS) {
      const parts = m.name.split(" ");
      await q("insert into medications(id,elder_id,name,dosage,time,label) values($1,'ruth-78',$2,$3,$4,$5)", [
        m.id, parts[0], parts.slice(1).join(" "), m.time, m.label,
      ]);
    }
    for (const m of MEMORIES) {
      await q("insert into memories(elder_id,title,note) values('ruth-78',$1,$2)", [m.title, m.note]);
    }
    await q("insert into escalations(elder_id,level,message) values('ruth-78','info','Morning Lisinopril confirmed.')");
  }
}
