import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const sql = neon(url);

export const q = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  sql.query(text, params) as unknown as Promise<T[]>;

export type TokenRow = {
  id: number;
  token: string;
  device_uuid: string;
  account_id: string | null;
  account_email: string | null;
  enabled: boolean;
  credits: number | null;
  status: "ok" | "invalid" | "expired" | "error" | "unknown";
  expires_at: number | null;
  checked_at: number | null;
  daily_claimed_on: string | null;
  generated_count: number;
  created_at: number;
  last_used_at: number | null;
};

export type RefFile = { link: string; name: string; thumb?: string; tokenId?: number };

export type ResultRow = {
  id: number;
  job_id: string;
  url: string | null;
  prompt: string;
  model_id: string;
  model_label: string;
  aspect: string;
  resolution: string;
  cost: number;
  token_id: number | null;
  refs: RefFile[];
  status: "pending" | "completed" | "failed";
  error: string | null;
  duration_ms: number | null;
  created_at: number;
  completed_at: number | null;
  deleted_at: number | null;
};

export function jwtClaims(token: string): { sub?: string; exp?: number } {
  try {
    const part = token.split(".")[1];
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return {
      sub: typeof json.sub === "string" ? json.sub : undefined,
      exp: typeof json.exp === "number" ? json.exp : undefined,
    };
  } catch {
    return {};
  }
}

export function jwtExpiry(token: string): Date | null {
  const { exp } = jwtClaims(token);
  return typeof exp === "number" ? new Date(exp * 1000) : null;
}

/** รอบเครดิต/เดลีรีเซ็ต 11:00 เวลาไทย — คีย์วันคือวันที่ก่อนถึงเวลารีเซ็ต */
export { resetDayKey } from "./models";

export function nextResetAt(now = new Date()): Date {
  const cand = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0);
  return new Date(cand > now.getTime() ? cand : cand + 86400e3);
}

export const isTokenUsable = (t: TokenRow) =>
  t.enabled && (!t.expires_at || t.expires_at > Date.now()) && t.status !== "invalid";

const ms = (col: string) => `(extract(epoch from ${col}) * 1000)::float8 as ${col}`;

export const TOKEN_COLS = `id, token, device_uuid::text as device_uuid, account_id, account_email, enabled, credits, status,
  ${ms("expires_at")}, ${ms("checked_at")}, to_char(daily_claimed_on, 'YYYY-MM-DD') as daily_claimed_on,
  generated_count, ${ms("created_at")}, ${ms("last_used_at")}`;

export const RESULT_COLS = `id, job_id, url, prompt, model_id, model_label, aspect, resolution, cost, token_id,
  refs, status, error, duration_ms, ${ms("created_at")}, ${ms("completed_at")}, ${ms("deleted_at")}`;

export function ictDayStart(now = new Date()): Date {
  return new Date(Math.floor((now.getTime() + 7 * 3600e3) / 86400e3) * 86400e3 - 7 * 3600e3);
}