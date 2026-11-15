import { randomBytes, randomUUID } from "node:crypto";
import { jwtClaims, q, TOKEN_COLS, type TokenRow } from "./db";
import { extractOtp, grabDomains, readMailbox, readMessage } from "./grabmail";
import { HttpError } from "./http";
import { sendEmailCode, verifyEmailCode } from "./overchat";

const WAIT_MS = 30_000;
const POLL_MS = 3000;

async function freshMailbox(): Promise<string> {
  const domains = await grabDomains();
  if (!domains.includes("grabmail.io")) {
    throw new HttpError(502, "Grabmail ปิดโดเมน grabmail.io อยู่ ลองใหม่ภายหลัง");
  }
  for (let i = 0; i < 3; i++) {
    const address = `oc${randomBytes(12).toString("hex")}@grabmail.io`;
    if (!(await readMailbox(address)).length) return address;
  }
  throw new HttpError(502, "สุ่มอีเมลว่างไม่สำเร็จ ลองใหม่อีกครั้ง");
}

/** สมัครบัญชีใหม่ด้วยอีเมล Grabmail แล้วยืนยัน OTP จนได้ token กลับมา */
export async function createAccount(): Promise<TokenRow> {
  const email = await freshMailbox();
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
  if (!code) throw new HttpError(504, "รอ OTP 40 วินาทีแล้วยังไม่ได้รับเมล — ลองสร้างบัญชีใหม่");

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