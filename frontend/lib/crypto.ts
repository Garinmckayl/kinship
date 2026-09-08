import { scrypt, randomBytes, timingSafeEqual, createHmac } from "crypto";

// Password hashing (scrypt, built-in — zero deps).
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await new Promise((res, rej) =>
    scrypt(password, salt, 64, (e, k) => (e ? rej(e) : res(k)))
  )) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const buf = (await new Promise((res, rej) =>
    scrypt(password, salt, 64, (e, k) => (e ? rej(e) : res(k)))
  )) as Buffer;
  const a = Buffer.from(hash, "hex");
  return a.length === buf.length && timingSafeEqual(a, buf);
}

// Minimal HS256 JWT (no dep).
function b64url(b: Buffer | string) {
  return Buffer.from(b).toString("base64url");
}

export function signJWT(payload: Record<string, unknown>, secret: string, expSec = 30 * 24 * 3600): string {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expSec }));
  const sig = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

export function verifyJWT(token: string, secret: string): Record<string, unknown> | null {
  try {
    const [h, p, sig] = token.split(".");
    const expect = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
    const actualBytes = Buffer.from(sig ?? "");
    const expectedBytes = Buffer.from(expect);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function randomId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}
