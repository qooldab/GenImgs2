import { q, type TokenRow, TOKEN_COLS } from "@/lib/db";
import { fail, HttpError, ok } from "@/lib/http";
import { readJob } from "@/lib/overchat";
import { completeResult, failResult, publicResult, refreshTokens, resultByJob } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STALE_MS = 15 * 60_000;

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await ctx.params;
    const row = await resultByJob(jobId);
    if (!row) throw new HttpError(404, "ไม่พบงานนี้ในระบบ");
    if (row.status === "completed") return ok({ status: "completed", url: row.url, result: publicResult(row) });
    if (row.status === "failed") return ok({ status: "failed", error: row.error || "สร้างภาพไม่สำเร็จ" });

    const age = Date.now() - row.created_at;
    if (age > STALE_MS) {
      const failed = await failResult(row.id, "งานค้างนานเกิน 15 นาที");
      return ok({ status: "failed", error: failed.error });
    }

    const token = row.token_id
      ? (await q<TokenRow>(`select ${TOKEN_COLS} from tokens where id = $1`, [row.token_id]))[0]
      : null;
    if (!token) {
      const failed = await failResult(row.id, "บัญชีที่ใช้สร้างภาพถูกลบไปแล้ว");
      return ok({ status: "failed", error: failed.error });
    }

    const state = await readJob(token.token, token.device_uuid, jobId);
    if (state.status === "completed" && state.url) {
      const done = await completeResult(row.id, state.url);
      await refreshTokens({ force: true, ids: [token.id] }).catch(() => {});
      return ok({ status: "completed", url: done.url, result: publicResult(done) });
    }
    if (state.status === "failed") {
      const failed = await failResult(row.id, state.error || "โมเดลสร้างภาพไม่สำเร็จ");
      return ok({ status: "failed", error: failed.error });
    }
    return ok({ status: "pending", elapsed: age });
  } catch (err) {
    return fail(err);
  }
}