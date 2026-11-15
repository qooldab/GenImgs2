import { createAccount } from "@/lib/create-token";
import { fail, guardAdmin, ok } from "@/lib/http";
import { listTokens, refreshTokens } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** สร้างบัญชีใหม่ 1 บัญชีต่อคำขอ — ฝั่งหน้าเว็บวนซ้ำตามจำนวนที่ระบุ */
export async function POST() {
  try {
    await guardAdmin();
    const created = await createAccount();
    await refreshTokens({ force: true, ids: [created.id] }).catch(() => {});
    return ok({
      created: { id: created.id, email: created.account_email },
      tokens: await listTokens(),
    });
  } catch (err) {
    return fail(err);
  }
}