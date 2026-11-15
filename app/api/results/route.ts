import { fail, ok } from "@/lib/http";
import { publicResult, publicResults } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") || 48);
    const rows = await publicResults(Number.isFinite(limit) ? limit : 48);
    return ok({ results: rows.map(publicResult) });
  } catch (err) {
    return fail(err);
  }
}