import { NextResponse } from "next/server";
import { isAdmin } from "./auth";
import { UpstreamError } from "./overchat";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const ok = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data as object, { ...init, headers: { "cache-control": "no-store", ...(init?.headers || {}) } });

export async function guardAdmin() {
  if (!(await isAdmin())) throw new HttpError(401, "ต้องเข้าสู่ระบบผู้ดูแลก่อน");
}

export function fail(err: unknown) {
  if (err instanceof HttpError) return ok({ error: err.message }, { status: err.status });
  if (err instanceof UpstreamError) {
    const status = err.status === 401 || err.status === 403 ? 502 : err.status >= 400 && err.status < 500 ? err.status : 502;
    return ok({ error: err.message }, { status });
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/timed out|abort/i.test(message)) return ok({ error: "เซิร์ฟเวอร์ปลายทางตอบช้าเกินไป ลองใหม่อีกครั้ง" }, { status: 504 });
  console.error("[genimgs]", err);
  return ok({ error: "เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์: " + message }, { status: 500 });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "รูปแบบข้อมูลไม่ถูกต้อง");
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}