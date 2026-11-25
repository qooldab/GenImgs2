import { jwtExpiry, q, TOKEN_COLS, type TokenRow } from "./db";
import { extractOtp, readMailbox, readMessage } from "./grabmail";
import { HttpError } from "./http";
import { isGrabmailAddress } from "./mail-domains";
import { sendEmailCode, verifyEmailCode } from "./overchat";

const WAIT_MS = 30_000;
const POLL_MS = 3000;

export const canRenew = (t: TokenRow) => isGrabmailAddress(t.account_email);

/** ล็อกอินบัญชีเดิมซ้ำ (OTP ทาง Grabmail) เพื่อออก token ใหม่ที่อายุยาวขึ้น */
export async function renewToken(row: TokenRow) {
  const email = row.account_email || "";
  if (!canRenew(row)) {
    throw new HttpError(400, "รี token อัตโนมัติได้เฉพาะอีเมล Grabmail (linqmail.com / mixozia.com)");
  }

  const before = new Set(
    (await readMailbox(email)).map((m) => m.id).filter((v): v is string => typeof v === "string"),
  );
  const requestedAt = Date.now();
  await sendEmailCode(email, row.device_uuid);

  let code: string | null = null;
  const deadline = Date.now() + WAIT_MS;
  while (!code && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const messages = (await readMailbox(email)).filter((m) => m.id && !before.has(m.id));
    for (const m of messages) {
      const full = await readMessage(m.id!, email);
      code = extractOtp(full, email, requestedAt);
      if (code) break;
    }
  }
  if (!code) throw new HttpError(504, "รอ OTP 40 วินาทีแล้วยังไม่ได้รับเมล — กดรี token อีกครั้ง");

  const accessToken = await verifyEmailCode(email, code, row.device_uuid);
  const exp = jwtExpiry(accessToken);
  const rows = await q<TokenRow>(
    `update tokens set token = $2, expires_at = $3, status = 'unknown', credits = null, checked_at = null
     where id = $1 returning ${TOKEN_COLS}`,
    [row.id, accessToken, exp ? exp.toISOString() : null],
  );
  return rows[0];
}