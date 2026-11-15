import { after } from "next/server";
import { fail, ok } from "@/lib/http";
import { listTokens, refreshTokens, summarize } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const tokens = await listTokens();
    const summary = summarize(tokens);
    const stale = tokens.some(
      (t) => t.enabled && (force || !t.checked_at || Date.now() - t.checked_at > 300_000),
    );
    // ตอบตัวเลขที่มีอยู่ทันที แล้วค่อยไปเช็คยอดสดเบื้องหลัง — หน้าเว็บไม่ต้องรอปลายทาง
    if (stale) after(() => refreshTokens({ force, maxAgeMs: 240_000 }).catch(() => {}));
    return ok({
      total: summary.total,
      usable: summary.usable,
      accounts: summary.accounts,
      tokens: summary.tokenCount,
      known: summary.known,
      checkedAt: summary.checkedAt,
      nextResetAt: summary.nextResetAt,
      refreshing: stale,
    });
  } catch (err) {
    return fail(err);
  }
}