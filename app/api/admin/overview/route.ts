import { fail, guardAdmin, ok } from "@/lib/http";
import { adminStats, listTokens, summarize } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await guardAdmin();
    const [stats, tokens] = await Promise.all([adminStats(), listTokens()]);
    return ok({ ...stats, summary: summarize(tokens) });
  } catch (err) {
    return fail(err);
  }
}