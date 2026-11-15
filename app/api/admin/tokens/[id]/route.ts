import { randomUUID } from "node:crypto";
import { jwtExpiry, q, TOKEN_COLS, type TokenRow } from "@/lib/db";
import { fail, guardAdmin, HttpError, ok, readJson } from "@/lib/http";
import { listTokens, refreshTokens } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = { enabled?: boolean; token?: string; rotateUuid?: boolean };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await guardAdmin();
    const { id } = await ctx.params;
    const tokenId = Number(id);
    if (!Number.isInteger(tokenId)) throw new HttpError(400, "รหัส token ไม่ถูกต้อง");
    const body = await readJson<Body>(req);

    const sets: string[] = [];
    const params: unknown[] = [tokenId];
    if (typeof body.enabled === "boolean") {
      params.push(body.enabled);
      sets.push(`enabled = $${params.length}`);
    }
    if (body.rotateUuid) {
      params.push(randomUUID());
      sets.push(`device_uuid = $${params.length}`);
    }
    if (typeof body.token === "string" && body.token.trim()) {
      const token = body.token.trim();
      if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
        throw new HttpError(400, "token ต้องเป็น JWT ที่ขึ้นต้นด้วย eyJ");
      }
      const exp = jwtExpiry(token);
      params.push(token, exp ? exp.toISOString() : null, randomUUID());
      sets.push(
        `token = $${params.length - 2}`,
        `expires_at = $${params.length - 1}`,
        `device_uuid = $${params.length}`,
        `account_id = null`,
        `account_email = null`,
        `status = 'unknown'`,
        `credits = null`,
        `checked_at = null`,
      );
    }
    if (!sets.length) throw new HttpError(400, "ไม่มีอะไรจะแก้ไข");
    const rows = await q<TokenRow>(`update tokens set ${sets.join(", ")} where id = $1 returning ${TOKEN_COLS}`, params);
    if (!rows[0]) throw new HttpError(404, "ไม่พบ token นี้");
    if (typeof body.token === "string" || body.rotateUuid) await refreshTokens({ force: true, ids: [tokenId] });
    return ok({ tokens: await listTokens() });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await guardAdmin();
    const { id } = await ctx.params;
    const tokenId = Number(id);
    if (!Number.isInteger(tokenId)) throw new HttpError(400, "รหัส token ไม่ถูกต้อง");
    const rows = await q<TokenRow>(`delete from tokens where id = $1 returning ${TOKEN_COLS}`, [tokenId]);
    if (!rows[0]) throw new HttpError(404, "ไม่พบ token นี้");
    return ok({ removed: rows[0], tokens: await listTokens() });
  } catch (err) {
    return fail(err);
  }
}