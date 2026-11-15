import { fail, guardAdmin, ok, readJson } from "@/lib/http";
import { claimDailyFor, listTokens, refreshTokens, summarize } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    await guardAdmin();
    const body = await readJson<{ ids?: number[] }>(req).catch(() => ({}) as { ids?: number[] });
    const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n)) : undefined;
    const all = await listTokens();
    const targets = ids ? all.filter((t) => ids.includes(t.id)) : all;
    const report = await claimDailyFor(targets);
    const tokens = await refreshTokens({ force: true, ids: targets.map((t) => t.id) });
    return ok({ report, tokens, summary: summarize(tokens) });
  } catch (err) {
    return fail(err);
  }
}