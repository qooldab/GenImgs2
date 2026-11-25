import { randomBytes, randomUUID } from "node:crypto";
import { jwtClaims, q, TOKEN_COLS, type TokenRow } from "./db";
import { extractOtp, pickMailDomains, readMailbox, readMessage } from "./grabmail";
import { HttpError } from "./http";
import { sendEmailCode, UpstreamError, verifyEmailCode } from "./overchat";

const WAIT_MS = 30_000;
const POLL_MS = 3000;

async function freshMailbox(domain: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const address = `oc${randomBytes(12).toString("hex")}@${domain}`;
    if (!(await readMailbox(address)).length) return address;
  }
  throw new HttpError(502, `สุ่มอีเมลว่างบน ${domain} ไม่สำเร็จ ลองใหม่อีกครั้ง`);
}

async function registerOn(domain: string): Promise<TokenRow> {
  const email = await freshMailbox(domain);
  const deviceUuid = randomUUID();
  const requestedAt = Date.now();
  await sendEmailCode(email, deviceUuid);

  let code: string | null = null;
  const deadline = Date.now() + WAIT_MS;
  while (!code && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    for (const mail of await readMailbox(email)) {
      if (!mail.id) continue;
      code = extractOtp(await readMessage(mail.id, email), email, requestedAt);
      if (code) break;
    }
  }
  if (!code) throw new HttpError(504, `รอ OTP 30 วินาทีแล้วยังไม่ได้รับเมลจาก ${domain} — ลองสร้างบัญชีใหม่`);

  const accessToken = await verifyEmailCode(email, code, deviceUuid);
  const claims = jwtClaims(accessToken);
  const exp = typeof claims.exp === "number" ? new Date(claims.exp * 1000) : null;

  const rows = await q<TokenRow>(
    `insert into tokens (token, expires_at, account_id, account_email, device_uuid, status)
     values ($1, $2, $3, $4, $5, 'unknown') returning ${TOKEN_COLS}`,
    [accessToken, exp ? exp.toISOString() : null, claims.sub ?? null, email, deviceUuid],
  );
  return rows[0];
}

/** สมัครบัญชีใหม่ด้วยอีเมล Grabmail แล้วยืนยัน OTP จนได้ token กลับมา (สลับโดเมนถ้าปลายทางไม่รับ) */
export async function createAccount(): Promise<TokenRow> {
  const domains = await pickMailDomains();
  if (!domains.length) throw new HttpError(502, "Grabmail ไม่ได้เปิดโดเมนสาธารณะให้ใช้งานตอนนี้");

  let lastError: unknown = null;
  for (const domain of domains) {
    try {
      return await registerOn(domain);
    } catch (err) {
      lastError = err;
      // 422 = Overchat ไม่รับอีเมลโดเมนนี้ → ลองโดเมนถัดไป (ไม่ใช่ rate limit)
      if (err instanceof UpstreamError && err.status === 422) continue;
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(502, "สร้างบัญชีไม่สำเร็จ ลองใหม่ภายหลัง");
}