import { fail, guardAdmin, HttpError, ok } from "@/lib/http";
import { canRenew, renewToken } from "@/lib/renew";
import { getToken, listTokens, refreshTokens } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await guardAdmin();
    const { id } = await ctx.params;
    const tokenId = Number(id);
    if (!Number.isInteger(tokenId)) throw new HttpError(400, "รหัส token ไม่ถูกต้อง");
    const row = await getToken(tokenId);
    if (!row) throw new HttpError(404, "ไม่พบ token นี้");
    if (!canRenew(row)) {
      throw new HttpError(400, "บัญชีนี้รี token อัตโนมัติไม่ได้ (รองรับเฉพาะอีเมล Grabmail)");
    }

    const renewed = await renewToken(row);
    await refreshTokens({ force: true, ids: [renewed.id] }).catch(() => {});
    return ok({
      renewed: { id: renewed.id, expiresAt: renewed.expires_at },
      tokens: await listTokens(),
    });
  } catch (err) {
    return fail(err);
  }
}