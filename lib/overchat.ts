import { RESOLUTION, type ModelSpec } from "./models";

const API = process.env.OVERCHAT_API_BASE || "https://api.overchat.ai";
const DEVICE_VERSION = "1.0.44";

export class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function deviceHeaders(deviceUuid: string, json = true): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    ...(json ? { "content-type": "application/json" } : {}),
    origin: "https://overchat.ai",
    referer: "https://overchat.ai/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    "x-device-language": "en",
    "x-device-platform": "web",
    "x-device-uuid": deviceUuid,
    "x-device-version": DEVICE_VERSION,
  };
}

function headers(token: string, deviceUuid: string, json = true): Record<string, string> {
  return { ...deviceHeaders(deviceUuid, json), authorization: `Bearer ${token}` };
}

async function call(path: string, token: string, deviceUuid: string, init: RequestInit = {}, timeout = 30_000) {
  const res = await fetch(API + path, {
    ...init,
    headers: { ...headers(token, deviceUuid, !isFormData(init.body)), ...(init.headers as Record<string, string>) },
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  return res;
}

const isFormData = (b: BodyInit | null | undefined) => typeof FormData !== "undefined" && b instanceof FormData;

async function errorFor(res: Response, fallback: string) {
  const raw = await res.text().catch(() => "");
  let detail = raw.slice(0, 300);
  try {
    const j = JSON.parse(raw);
    if (typeof j?.message === "string") detail = Array.isArray(j.message) ? j.message.join(", ") : j.message;
  } catch {}
  const map: Record<number, string> = {
    401: "token ใช้ไม่ได้หรือหมดอายุ (401)",
    402: "เครดิตของบัญชีนี้ไม่พอ (402)",
    403: "ถูกปฏิเสธการเข้าถึง (403)",
    413: "ไฟล์ใหญ่เกินที่เซิร์ฟเวอร์รับ (413)",
    429: "ยิงถี่เกินไป รอสักครู่แล้วลองใหม่ (429)",
  };
  return new UpstreamError(map[res.status] || `${fallback} (HTTP ${res.status}) ${detail}`.trim(), res.status);
}

export async function fetchAccount(
  token: string,
  deviceUuid: string,
): Promise<{ credits: number; accountId: string | null; email: string | null }> {
  const res = await call("/v1/auth/me", token, deviceUuid, {}, 15_000);
  if (!res.ok) throw await errorFor(res, "เช็คเครดิตไม่สำเร็จ");
  const data = await res.json();
  return {
    credits: Number(data?.takosCoin ?? 0),
    accountId: typeof data?.id === "string" ? data.id : null,
    email: typeof data?.email === "string" ? data.email : null,
  };
}

/** ขอล็อกอินด้วยอีเมล (ไม่ต้องใช้ bearer) — ใช้รี token ของบัญชีเดิม */
async function emailAuth(path: string, email: string, deviceUuid: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: deviceHeaders(deviceUuid),
    body: JSON.stringify({ email, ...extra }),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) throw await errorFor(res, "ยืนยันอีเมลไม่สำเร็จ");
  return res.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

export async function sendEmailCode(email: string, deviceUuid: string, attempts = 4): Promise<void> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const data = await emailAuth("/v1/auth/email/send-code", email, deviceUuid);
      if (data.message !== "Verification code sent") {
        throw new UpstreamError("Overchat ไม่ได้ยืนยันว่าได้ส่งโค้ดแล้ว", 502);
      }
      return;
    } catch (err) {
      lastError = err;
      const limited = err instanceof UpstreamError && err.status === 429;
      if (!limited || i === attempts - 1) throw err;
      // ปลายทางจำกัดจำนวน OTP ต่อ IP — รอแล้วลองใหม่แบบถ่างขึ้นเรื่อย ๆ
      await new Promise((r) => setTimeout(r, 3500 + i * 4000 + Math.random() * 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new UpstreamError("ขอ OTP ไม่สำเร็จ", 502);
}

export async function verifyEmailCode(email: string, code: string, deviceUuid: string): Promise<string> {
  const data = await emailAuth("/v1/auth/email/verify", email, deviceUuid, { code });
  const token = data.access_token;
  if (typeof token !== "string" || !token) throw new UpstreamError("Overchat ไม่ได้ส่ง access token กลับมา", 502);
  return token;
}

export async function uploadReference(
  token: string,
  deviceUuid: string,
  file: Blob,
  filename: string,
): Promise<{ link: string; thumb?: string }> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await call("/v1/chat/upload", token, deviceUuid, { method: "POST", body: form }, 120_000);
  if (!res.ok) throw await errorFor(res, "อัปโหลดรูปไม่สำเร็จ");
  const data = await res.json();
  const link = data?.link || data?.url;
  if (typeof link !== "string") throw new UpstreamError("เซิร์ฟเวอร์ไม่ส่งลิงก์รูปกลับ", 502);
  return { link, thumb: typeof data?.croppedImageLink === "string" ? data.croppedImageLink : undefined };
}

export async function submitGeneration(opts: {
  token: string;
  deviceUuid: string;
  prompt: string;
  spec: ModelSpec;
  aspect: string;
  refs: { link: string; name: string }[];
}): Promise<string> {
  const payload = {
    chatId: crypto.randomUUID(),
    prompt: opts.prompt,
    userMessageText: opts.prompt,
    model: opts.spec.model,
    personaId: opts.spec.id,
    output_format: "png",
    params: { resolution: RESOLUTION, num_images: 1, output_format: "jpeg" },
    metadata: {
      flow_type: "image",
      aspect_ratio: opts.aspect,
      ...(opts.refs.length ? { files: opts.refs.map((r) => ({ link: r.link, name: r.name })) } : {}),
    },
  };
  const res = await call(
    "/v1/images/generation",
    opts.token,
    opts.deviceUuid,
    { method: "POST", body: JSON.stringify(payload) },
    60_000,
  );
  if (!res.ok) throw await errorFor(res, "ส่งคำสั่งสร้างภาพไม่สำเร็จ");
  const data = await res.json();
  const id = typeof data?.id === "string" ? data.id : Array.isArray(data) ? data[0]?.id : undefined;
  if (!id) throw new UpstreamError("เซิร์ฟเวอร์ไม่ส่งรหัสงานกลับ", 502);
  return id;
}

export type JobState = { status: "pending" | "completed" | "failed"; url?: string; error?: string };

export async function readJob(token: string, deviceUuid: string, jobId: string): Promise<JobState> {
  const res = await call(`/v1/images/generation/${encodeURIComponent(jobId)}`, token, deviceUuid);
  if (res.status === 422) {
    const data = await res.json().catch(() => ({}));
    if (data?.message === "WARN_IMAGE_URL_NOT_READY") return { status: "pending" };
    return { status: "failed", error: String(data?.message || "เซิร์ฟเวอร์ตอบ 422") };
  }
  if (!res.ok) throw await errorFor(res, "เช็คสถานะงานไม่สำเร็จ");
  const data = await res.json();
  const state = String(data?.status || "").toLowerCase();
  if (["completed", "succeeded", "success", "done", "finished"].includes(state) && data?.url) {
    return { status: "completed", url: String(data.url) };
  }
  if (["failed", "failure", "error", "cancelled", "canceled"].includes(state)) {
    return { status: "failed", error: String(data?.message || data?.error || "โมเดลสร้างภาพไม่สำเร็จ") };
  }
  return { status: "pending" };
}

export async function readDaily(token: string, deviceUuid: string) {
  const res = await call("/v1/daily-activity", token, deviceUuid);
  if (!res.ok) throw await errorFor(res, "เช็คสถานะเดลีไม่สำเร็จ");
  return res.json();
}

export async function claimDaily(token: string, deviceUuid: string): Promise<{ gained: number; balance: number | null }> {
  const start = await call("/v1/daily-activity/start", token, deviceUuid, { method: "POST" });
  if (!start.ok && start.status !== 409) throw await errorFor(start, "เริ่มกิจกรรมรายวันไม่สำเร็จ");
  const res = await call("/v1/daily-activity/claim", token, deviceUuid, { method: "POST" });
  if (!res.ok) throw await errorFor(res, "รับเครดิตรายวันไม่สำเร็จ");
  const data = await res.json().catch(() => ({}));
  const reward = data?.reward;
  return {
    gained: Number(reward?.earnedToday ?? 0),
    balance: typeof reward?.newBalance === "number" ? reward.newBalance : null,
  };
}

const hostOk = (link: string, test: (host: string) => boolean) => {
  try {
    const u = new URL(link);
    return u.protocol === "https:" && test(u.hostname);
  } catch {
    return false;
  }
};

export const REF_HOST_OK = (link: string) =>
  hostOk(link, (h) => h.endsWith(".your-objectstorage.com") || h === "api.overchat.ai");

export const IMAGE_HOST_OK = (link: string) =>
  hostOk(
    link,
    (h) =>
      h.endsWith(".your-objectstorage.com") ||
      h === "api.overchat.ai" ||
      /^overchat[.-].*\.amazonaws\.com$/.test(h) ||
      h.endsWith(".overchat.ai"),
  );