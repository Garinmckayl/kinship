import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword, signJWT, verifyJWT, randomId } from "./crypto";
import { createUser as storeCreateUser, getUserByEmail } from "./store";

export type Role = "caregiver" | "elder";
export type User = { id: number; name: string; email: string; role: Role };

const COOKIE = "elderlove_session";
const MAX_AGE = 30 * 24 * 3600;
const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
  return value ?? "dev-secret-change-me";
};

// --- users (Postgres; auth requires the database) ---
export async function createUser(name: string, email: string, password: string, role: Role = "caregiver"): Promise<User> {
  const em = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error("invalid email");
  if (password.length < 6) throw new Error("password too short (min 6)");
  if (role !== "caregiver" && role !== "elder") throw new Error("invalid role");
  const ex = await getUserByEmail(em).catch(() => null);
  if (ex) throw new Error("email already registered");
  const r = await storeCreateUser(name.trim() || "Caregiver", em, await hashPassword(password), role);
  return { id: r.id, name: r.name, email: r.email, role: r.role as Role };
}

export async function verifyUser(email: string, password: string): Promise<User> {
  const u = await getUserByEmail(email.trim().toLowerCase()).catch(() => null);
  if (!u || !(await verifyPassword(password, u.password_hash))) throw new Error("invalid email or password");
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role };
}

export function mintSession(u: User): string {
  return signJWT({ sub: u.id, name: u.name, email: u.email, role: u.role }, secret());
}

export async function getSession(): Promise<User | null> {
  try {
    const token = cookies().get(COOKIE)?.value;
    if (!token) return null;
    const p = verifyJWT(token, secret());
    if (!p) return null;
    return { id: p.sub as number, name: p.name as string, email: p.email as string, role: p.role as Role };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set({
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function requireCaregiver(): Promise<User> {
  const u = await getSession();
  if (!u) throw NextResponse.json({ error: "login required" }, { status: 401 });
  if (u.role !== "caregiver") throw NextResponse.json({ error: "caregiver only" }, { status: 403 });
  return u;
}

export { randomId };
