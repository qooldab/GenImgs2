import { fail, guardAdmin, ok, readJson } from "@/lib/http";
import { addTokens, listTokens, refreshTokens, summarize } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await guardAdmin();
    const tokens = await listTokens();
    return ok({ tokens, summary: summarize(tokens) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    await guardAdmin();
    const body = await readJson<{ raw?: string; allowAccountDuplicates?: boolean }>(req);
    const { added, duplicates } = await addTokens(body.raw || "", {
      allowAccountDuplicates: body.allowAccountDuplicates === true,
    });
    if (added.length) await refreshTokens({ force: true, ids: added.map((t) => t.id) });
    return ok({ added: added.length, duplicates, tokens: await listTokens() });
  } catch (err) {
    return fail(err);
  }
}