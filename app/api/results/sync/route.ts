import { ASPECTS, MODELS, type GalleryItem } from "@/lib/models";
import { q } from "@/lib/db";
import { fail, HttpError, ok, readJson } from "@/lib/http";
import { IMAGE_HOST_OK } from "@/lib/overchat";

export const dynamic = "force-dynamic";

type Item = {
  jobId?: unknown;
  url?: unknown;
  prompt?: unknown;
  modelId?: unknown;
  aspect?: unknown;
  cost?: unknown;
  createdAt?: unknown;
};

/** รับประวัติที่เก็บในเบราว์เซอร์ผู้ใช้ แล้วเติมลงฐานข้อมูลถ้ายังไม่มี (ใช้ jobId กันซ้ำ) */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ items?: Item[] }>(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
    let synced = 0;

    for (const raw of items) {
      const jobId = typeof raw.jobId === "string" ? raw.jobId.trim() : "";
      const url = typeof raw.url === "string" ? raw.url : "";
      const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, 6000) : "";
      if (!/^[A-Za-z0-9_-]{8,90}$/.test(jobId) || !IMAGE_HOST_OK(url) || !prompt) continue;

      const spec = MODELS.find((m) => m.id === raw.modelId);
      if (!spec) continue;
      const aspect = ASPECTS.includes(raw.aspect as (typeof ASPECTS)[number]) ? (raw.aspect as string) : "16:9";
      const cost =
        Number.isInteger(raw.cost) && (raw.cost as number) >= 0 && (raw.cost as number) <= 200
          ? (raw.cost as number)
          : spec.cost;
      const at =
        typeof raw.createdAt === "number" && raw.createdAt > 0 ? Math.min(raw.createdAt, Date.now()) : Date.now();

      const rows = await q<{ id: number }>(
        `insert into results (job_id, url, prompt, model_id, model_label, aspect, resolution, cost, refs, status, created_at, completed_at)
         values ($1, $2, $3, $4, $5, $6, '1K', $7, '[]'::jsonb, 'completed', to_timestamp($8 / 1000.0), to_timestamp($8 / 1000.0))
         on conflict (job_id) do nothing
         returning id`,
        [jobId, url, prompt, spec.id, spec.label, aspect, cost, at],
      );
      synced += rows.length;
    }

    return ok({ synced });
  } catch (err) {
    if (err instanceof HttpError) return fail(err);
    return fail(err);
  }
}
