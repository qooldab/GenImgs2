import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createSession, passwordMatches, SESSION_DAYS } from "@/lib/auth";
import { fail, HttpError, ok, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.ADMIN_PASSWORD) throw new HttpError(503, "เซิร์ฟเวอร์ยังไม่ได้ตั้ง ADMIN_PASSWORD");
    const body = await readJson<{ password?: string }>(req);
    if (!passwordMatches(body.password)) throw new HttpError(401, "รหัสไม่ถูกต้อง");
    const res = ok({ ok: true });
    res.cookies.set(ADMIN_COOKIE, createSession(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    return res;
  } catch (err) {
    if (err instanceof HttpError) {
      await new Promise((r) => setTimeout(r, 600));
    }
    return fail(err);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}