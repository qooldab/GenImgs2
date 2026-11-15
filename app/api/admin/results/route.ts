import { fail, guardAdmin, HttpError, ok, readJson } from "@/lib/http";
import { adminResults, markResultsDeleted, restoreResults, type ResultQuery } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await guardAdmin();
    const p = new URL(req.url).searchParams;
    const query: ResultQuery = {
      search: p.get("search") || "",
      model: p.get("model") || "all",
      status: p.get("status") || "all",
      sort: (p.get("sort") as ResultQuery["sort"]) || "created_at",
      dir: (p.get("dir") as ResultQuery["dir"]) || "desc",
      page: Number(p.get("page") || 1),
      pageSize: Number(p.get("pageSize") || 24),
    };
    return ok(await adminResults(query));
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await guardAdmin();
    const body = await readJson<{ ids?: number[] }>(req);
    const ids = (body.ids || []).filter((n) => Number.isInteger(n));
    if (!ids.length) throw new HttpError(400, "ไม่ได้เลือกรายการที่จะลบ");
    const rows = await markResultsDeleted(ids);
    return ok({ deleted: rows.map((r) => r.id) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    await guardAdmin();
    const body = await readJson<{ ids?: number[] }>(req);
    const ids = (body.ids || []).filter((n) => Number.isInteger(n));
    if (!ids.length) throw new HttpError(400, "ไม่ได้เลือกรายการที่จะกู้คืน");
    const rows = await restoreResults(ids);
    return ok({ restored: rows.map((r) => r.id) });
  } catch (err) {
    return fail(err);
  }
}