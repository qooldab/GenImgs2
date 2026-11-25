/** อ่านกล่องจดหมาย Grabmail (เฉพาะอีเมลบนโดเมนที่ Grabmail เปิดให้) เพื่อขอ OTP ใหม่ให้บัญชีเดิม */
import { MAIL_FALLBACK_DOMAINS } from "./mail-domains";

const BASE = "https://grabmail.io/api/v1";

export type GrabMail = {
  id?: string;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  date?: string;
};

const UA = "GenImgs/1.0";

async function getJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = BASE + path + (params ? "?" + new URLSearchParams(params).toString() : "");
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(res.status === 429 ? "Grabmail จำกัดจำนวนคำขอ รอสักครู่แล้วลองใหม่" : `อ่าน Grabmail ไม่สำเร็จ (HTTP ${res.status})`);
  }
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== "object") throw new Error("รูปแบบข้อมูลจาก Grabmail ไม่ถูกต้อง");
  return data as T;
}

export async function readMailbox(address: string): Promise<GrabMail[]> {  const data = await getJson<{ address?: string; messages?: unknown }>("/mailbox", { address, limit: "20" });
  if (String(data.address || "").toLowerCase() !== address.toLowerCase()) {
    throw new Error("Grabmail ส่งกล่องจดหมายที่ไม่ตรงกับอีเมลนี้");
  }
  return Array.isArray(data.messages) ? (data.messages as GrabMail[]) : [];
}

export const readMessage = (id: string, mailbox: string) =>
  getJson<GrabMail>("/message/" + encodeURIComponent(id), { mailbox });

export async function grabDomains(): Promise<string[]> {
  const data = await getJson<{ public?: unknown }>("/domains");
  return Array.isArray(data.public) ? (data.public as string[]).filter((d) => typeof d === "string") : [];
}

/** โดเมนที่ลองใช้: เอาที่ Overchat เคยรับก่อน แล้วต่อด้วยโดเมนอื่นที่ Grabmail เปิดอยู่ */
export async function pickMailDomains(): Promise<string[]> {
  const live = await grabDomains();
  const preferred = MAIL_FALLBACK_DOMAINS.filter((d) => live.includes(d));
  const rest = live.filter((d) => !MAIL_FALLBACK_DOMAINS.includes(d));
  return [...new Set([...preferred, ...rest])];
}

const mailTime = (m: GrabMail) => {
  const t = m.date ? Date.parse(m.date) : NaN;
  return Number.isFinite(t) ? t : 0;
};

const senderOk = (m: GrabMail) => {
  const f = String(m.from || "").toLowerCase();
  const domain = f.slice(f.lastIndexOf("@") + 1);
  return domain === "overchat.ai" || domain.endsWith(".overchat.ai");
};

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

/** คืนรหัส OTP 4 หลักจากเมล Overchat ที่เพิ่งส่งมา — คืน null ถ้าไม่ตรงเงื่อนไข */
export function extractOtp(mail: GrabMail, address: string, requestedAt: number): string | null {
  if (!senderOk(mail)) return null;
  const to = String(mail.to || "").toLowerCase();
  if (!to.includes(address.toLowerCase())) return null;
  const when = mailTime(mail);
  if (!(when >= requestedAt - 2000 && when <= Date.now() + 60_000)) return null;

  const subject = String(mail.subject || "").replace(/\s+/g, "");
  const codes = new Set<string>();
  for (const m of subject.matchAll(/(?<!\d)(\d{4})(?!\d)[-–—:]yourOverchatverificationcode/gi)) codes.add(m[1]);

  let body = typeof mail.text === "string" ? mail.text : "";
  if (!body && typeof mail.html === "string") body = stripHtml(mail.html);
  for (const m of body.matchAll(/your\s+verification\s+code\s*[:\-]?\s*(\d{4})(?!\d)/gi)) codes.add(m[1]);

  return codes.size === 1 ? [...codes][0] : null;
}