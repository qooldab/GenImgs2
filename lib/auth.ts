import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// ต้องตั้ง ADMIN_PASSWORD ใน environment เท่านั้น — ไม่มีรหัสสำรองในโค้ด
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  createHash("sha256").update(`genimgs|${PASSWORD}|${process.env.DATABASE_URL || ""}`).digest("hex");

export const ADMIN_COOKIE = "gi_admin";
export const SESSION_DAYS = 7;

const sign = (exp: number) => createHmac("sha256", SECRET).update(String(exp)).digest("hex");

export function createSession(): string {
  const exp = Date.now() + SESSION_DAYS * 86400e3;
  return `${exp}.${sign(exp)}`;
}

export function verifySession(value?: string): boolean {
  if (!value) return false;
  const [expRaw, mac] = value.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() || !mac) return false;
  const expected = sign(exp);
  if (expected.length !== mac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}

export function passwordMatches(input: unknown): boolean {
  if (!PASSWORD || typeof input !== "string" || input.length > 200) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(ADMIN_COOKIE)?.value);
}