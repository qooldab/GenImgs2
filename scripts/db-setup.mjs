import { readFileSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

try {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
} catch {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ไม่พบ DATABASE_URL (ตั้งใน .env.local หรือ environment)");
  process.exit(1);
}
const sql = neon(url);

await sql.query(`
  create table if not exists tokens (
    id serial primary key,
    token text not null unique,
    device_uuid uuid not null default gen_random_uuid(),
    enabled boolean not null default true,
    credits integer,
    status text not null default 'unknown',
    expires_at timestamptz,
    checked_at timestamptz,
    daily_claimed_on date,
    generated_count integer not null default 0,
    created_at timestamptz not null default now(),
    last_used_at timestamptz
  )
`);

await sql.query(`
  create table if not exists results (
    id serial primary key,
    job_id text not null unique,
    url text,
    prompt text not null default '',
    model_id text not null,
    model_label text not null,
    aspect text not null,
    resolution text not null default '1K',
    cost integer not null default 0,
    token_id integer references tokens(id) on delete set null,
    refs jsonb not null default '[]'::jsonb,
    status text not null default 'pending',
    error text,
    duration_ms integer,
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    deleted_at timestamptz
  )
`);

await sql.query(`create index if not exists results_created_at_idx on results (created_at desc)`);
await sql.query(`create index if not exists results_status_idx on results (status, deleted_at)`);

// เครดิตเป็นของ "บัญชี" ไม่ใช่ของ token — หลาย token ของบัญชีเดียวกันใช้เครดิตกองเดียวกัน
await sql.query(`alter table tokens add column if not exists account_id text`);
await sql.query(`alter table tokens add column if not exists account_email text`);
await sql.query(`create index if not exists tokens_account_idx on tokens (account_id)`);
// ไม่เก็บชื่อที่ตั้งเองแล้ว — ใช้ account_email เป็นชื่อบัญชี
await sql.query(`alter table tokens drop column if exists label`);

const needAccount = await sql.query(`select id, token from tokens where account_id is null or account_id = ''`);
for (const row of needAccount) {
  let sub = null;
  try {
    const payload = JSON.parse(Buffer.from(row.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (typeof payload.sub === "string") sub = payload.sub;
  } catch {}
  if (sub) await sql.query(`update tokens set account_id = $2 where id = $1`, [row.id, sub]);
}
if (needAccount.length) console.log(`เติม account_id ให้ token เดิม ${needAccount.length} รายการ`);

console.log("ตาราง tokens + results พร้อมแล้ว");

const tokenFile = process.argv.includes("--import-tokens") ? "token.txt" : null;
if (tokenFile && existsSync(tokenFile)) {
  const lines = readFileSync(tokenFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.split("|")[0].trim())
    .filter((l) => l.startsWith("eyJ"));
  let added = 0;
  for (const token of [...new Set(lines)]) {
    let exp = null;
    let sub = null;
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
      if (payload.exp) exp = new Date(payload.exp * 1000).toISOString();
      if (typeof payload.sub === "string") sub = payload.sub;
    } catch {}
    const rows = await sql.query(
      `insert into tokens (token, expires_at, account_id) values ($1, $2, $3)
       on conflict (token) do nothing returning id`,
      [token, exp, sub],
    );
    added += rows.length;
  }
  console.log(`นำเข้า token จาก ${tokenFile}: เพิ่มใหม่ ${added} จาก ${new Set(lines).size} รายการ`);
}

const counts = await sql.query(
  `select (select count(*) from tokens)::int as tokens, (select count(*) from results)::int as results`,
);
console.log("สถานะฐานข้อมูล:", counts[0]);