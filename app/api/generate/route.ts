import { ASPECTS, getModel, RESOLUTION } from "@/lib/models";
import { fail, HttpError, ok, readJson } from "@/lib/http";
import { q, type RefFile } from "@/lib/db";
import { REF_HOST_OK, submitGeneration, UpstreamError } from "@/lib/overchat";
import { createResult, pickOrder, refreshTokens } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = { prompt?: string; modelId?: string; aspect?: string; refs?: RefFile[] };

export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req);
    const prompt = (body.prompt || "").trim();
    if (!prompt) throw new HttpError(400, "พิมพ์บรรยายภาพก่อน");
    if (prompt.length > 6000) throw new HttpError(400, "พรอมป์ยาวเกิน 6,000 ตัวอักษร");
    const spec = getModel(body.modelId || "");
    if (!spec) throw new HttpError(400, "ไม่รู้จักโมเดลที่เลือก");
    const aspect = ASPECTS.includes(body.aspect as (typeof ASPECTS)[number]) ? body.aspect! : "16:9";
    const refs = Array.isArray(body.refs) ? body.refs.slice(0, spec.maxFiles) : [];
    for (const r of refs) {
      if (typeof r?.link !== "string" || !REF_HOST_OK(r.link)) throw new HttpError(400, "ลิงก์รูปอ้างอิงไม่ถูกต้อง");
    }
    if (Array.isArray(body.refs) && body.refs.length > spec.maxFiles) {
      throw new HttpError(400, `${spec.label} แนบรูปได้สูงสุด ${spec.maxFiles} รูป`);
    }

    const tokens = await refreshTokens({ maxAgeMs: 120_000 });
    const preferred = refs.find((r) => typeof r.tokenId === "number")?.tokenId ?? null;
    const order = pickOrder(tokens, spec.cost, preferred);
    if (!order.length) {
      const anyUsable = tokens.some((t) => t.enabled && t.status !== "invalid");
      throw new HttpError(
        anyUsable ? 402 : 503,
        anyUsable
          ? `เครดิตไม่พอสำหรับ ${spec.label} (ต้องการ ${spec.cost} เครดิต) — เครดิตจะรีเซ็ตเวลา 11:00 น.`
          : "ยังไม่มีบัญชีที่พร้อมสร้างภาพ แจ้งผู้ดูแลระบบ",
      );
    }

    let lastError: unknown = null;
    for (const token of order) {
      try {
        const jobId = await submitGeneration({
          token: token.token,
          deviceUuid: token.device_uuid,
          prompt,
          spec,
          aspect,
          refs: refs.map((r) => ({ link: r.link, name: r.name || "reference.jpg" })),
        });
        const result = await createResult({
          jobId,
          prompt,
          modelId: spec.id,
          modelLabel: spec.label,
          aspect,
          resolution: RESOLUTION,
          cost: spec.cost,
          tokenId: token.id,
          refs,
        });
        return ok({ jobId, resultId: result.id, cost: spec.cost, modelLabel: spec.label, aspect });
      } catch (err) {
        lastError = err;
        if (err instanceof UpstreamError && err.status === 401) {
          await q(`update tokens set status = 'invalid', checked_at = now() where id = $1`, [token.id]);
          continue;
        }
        if (err instanceof UpstreamError && err.status === 402) {
          await q(`update tokens set credits = 0, checked_at = now() where id = $1`, [token.id]);
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new HttpError(502, "ส่งคำสั่งสร้างภาพไม่สำเร็จ");
  } catch (err) {
    return fail(err);
  }
}