import { fail, guardAdmin, ok, readJson } from "@/lib/http";
import { listTokens, refreshTokens, summarize } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await guardAdmin();
    const body = await readJson<{ ids?: number[] }>(req).catch(() => ({}) as { ids?: number[] });
    const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n)) : undefined;
    const tokens = await refreshTokens({ force: true, ids });
    return ok({ tokens, summary: summarize(tokens) });
  } catch (err) {
    return fail(err);
  }
}