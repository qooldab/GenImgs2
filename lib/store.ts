import {
  q,
  RESULT_COLS,
  TOKEN_COLS,
  ictDayStart,
  isTokenUsable,
  jwtClaims,
  nextResetAt,
  resetDayKey,
  type RefFile,
  type ResultRow,
  type TokenRow,
} from "./db";
import { HttpError, mapLimit } from "./http";
import { MIN_COST } from "./models";
import { claimDaily, fetchAccount, readDaily, UpstreamError } from "./overchat";

export const listTokens = () => q<TokenRow>(`select ${TOKEN_COLS} from tokens order by created_at, id`);

export const getToken = async (id: number) =>
  (await q<TokenRow>(`select ${TOKEN_COLS} from tokens where id = $1`, [id]))[0];

/** token หลายตัวของบัญชีเดียวกันใช้เครดิตกองเดียวกัน — ใช้คีย์นี้ในการนับ/เลือกบัญชี */
export const accountKey = (t: Pick<TokenRow, "id" | "account_id">) => t.account_id || `token:${t.id}`;

export function groupByAccount(tokens: TokenRow[]) {
  const groups = new Map<string, TokenRow[]>();
  for (const t of tokens) {
    const key = accountKey(t);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

const freshest = (list: TokenRow[]) =>
  [...list].sort((a, b) => (b.checked_at ?? 0) - (a.checked_at ?? 0))[0];

export type CreditSummary = {
  total: number;
  usable: number;
  accounts: number;
  tokenCount: number;
  known: boolean;
  checkedAt: number | null;
  nextResetAt: number;
  dailyPending: number;
};

export function summarize(tokens: TokenRow[]): CreditSummary {
  const today = resetDayKey();
  const groups = groupByAccount(tokens);
  let total = 0;
  let usable = 0;
  let knownCount = 0;
  let dailyPending = 0;
  const checked: number[] = [];

  for (const list of groups.values()) {
    const live = list.filter(isTokenUsable);
    if (!live.length) continue;
    usable++;
    const snapshot = freshest(live);
    if (snapshot.credits !== null) {
      // เครดิตที่ไม่พอซื้อภาพได้แม้แต่ภาพเดียว (ต่ำกว่า 15) นับเป็น 0
      total += snapshot.credits >= MIN_COST ? snapshot.credits : 0;
      knownCount++;
    }
    if (snapshot.checked_at) checked.push(snapshot.checked_at);
    if (!live.some((t) => t.daily_claimed_on === today)) dailyPending++;
  }

  return {
    total,
    usable,
    accounts: groups.size,
    tokenCount: tokens.length,
    known: usable > 0 && knownCount === usable,
    checkedAt: checked.length ? Math.min(...checked) : null,
    nextResetAt: nextResetAt().getTime(),
    dailyPending,
  };
}

/** เช็คเครดิตสด (ครั้งเดียวต่อบัญชี) แล้วเขียนกลับให้ทุก token ของบัญชีนั้น */
export async function refreshTokens({
  force = false,
  maxAgeMs = 300_000,
  ids,
}: { force?: boolean; maxAgeMs?: number; ids?: number[] } = {}) {
  const tokens = await listTokens();
  const targets = tokens.filter(
    (t) => t.enabled && (!ids || ids.includes(t.id)) && (force || !t.checked_at || Date.now() - t.checked_at > maxAgeMs),
  );
  if (!targets.length) return tokens;

  const groups = groupByAccount(tokens);
  const keys = [...new Set(targets.map(accountKey))];

  await mapLimit(keys, 4, async (key) => {
    const list = (groups.get(key) || []).filter((t) => t.enabled);
    const candidates = list
      .filter((t) => !t.expires_at || t.expires_at > Date.now())
      .sort((a, b) => (a.last_used_at ?? 0) - (b.last_used_at ?? 0));
    if (!candidates.length) return;

    let lastError: unknown = null;
    for (const t of candidates) {
      try {
        const acct = await fetchAccount(t.token, t.device_uuid);
        await q(
          `update tokens set credits = $2, status = 'ok', checked_at = now(),
             account_email = coalesce(account_email, $3),
             account_id = coalesce(account_id, $4)
           where id = any($1::int[])`,
          [list.map((x) => x.id), acct.credits, acct.email, acct.accountId],
        );
        return;
      } catch (err) {
        lastError = err;
        if (err instanceof UpstreamError && err.status === 401) {
          await q(`update tokens set status = 'invalid', checked_at = now() where id = $1`, [t.id]);
        }
      }
    }
    const status = lastError instanceof UpstreamError && lastError.status === 401 ? "invalid" : "error";
    await q(`update tokens set status = $2, checked_at = now() where id = any($1::int[])`, [list.map((x) => x.id), status]);
  });

  return listTokens();
}

/** ลำดับบัญชีที่จะลองใช้: บัญชีที่อัปโหลดรูปอ้างอิงก่อน แล้วเรียงตามเครดิตมากสุด (บัญชีละครั้ง) */
export function pickOrder(tokens: TokenRow[], cost: number, preferredId?: number | null): TokenRow[] {
  const eligible = tokens.filter((t) => isTokenUsable(t) && (t.credits === null || t.credits >= cost));
  const preferred = preferredId ? eligible.find((t) => t.id === preferredId) : undefined;

  return [...groupByAccount(eligible).values()]
    .map((list) => {
      const pin = list.find((t) => t.id === preferredId);
      if (pin) return pin;
      return [...list].sort((a, b) => {
        const ca = a.credits ?? -1;
        const cb = b.credits ?? -1;
        if (ca !== cb) return cb - ca;
        return (a.last_used_at ?? 0) - (b.last_used_at ?? 0);
      })[0];
    })
    .sort((a, b) => {
      if (preferred) {
        const pa = accountKey(a) === accountKey(preferred) ? 1 : 0;
        const pb = accountKey(b) === accountKey(preferred) ? 1 : 0;
        if (pa !== pb) return pb - pa;
      }
      const ca = a.credits ?? -1;
      const cb = b.credits ?? -1;
      if (ca !== cb) return cb - ca;
      return (a.last_used_at ?? 0) - (b.last_used_at ?? 0);
    });
}

export async function addTokens(raw: string, opts: { allowAccountDuplicates?: boolean } = {}) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.split("|")[0].trim())
    .filter((l) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(l));
  if (!lines.length) throw new HttpError(400, "ไม่พบ token ที่ถูกต้อง (ต้องเป็น JWT ขึ้นต้นด้วย eyJ)");

  const known = new Map<string, string>();
  for (const row of await q<{ account_id: string | null; account_email: string | null }>(
    `select account_id, account_email from tokens where account_id is not null order by created_at`,
  )) {
    if (row.account_id) known.set(row.account_id, row.account_email || "บัญชีที่มีอยู่แล้ว");
  }

  const added: TokenRow[] = [];
  const duplicates: string[] = [];
  for (const token of [...new Set(lines)]) {
    const claims = jwtClaims(token);
    const exp = typeof claims.exp === "number" ? new Date(claims.exp * 1000) : null;
    const masked = "••••" + token.slice(-6);
    if (claims.sub && known.has(claims.sub) && !opts.allowAccountDuplicates) {
      duplicates.push(`${masked} (บัญชีเดียวกับ ${known.get(claims.sub)} — เครดิตนับรวมกันอยู่แล้ว)`);
      continue;
    }
    const rows = await q<TokenRow>(
      `insert into tokens (token, expires_at, status, account_id)
       values ($1, $2, $3, $4)
       on conflict (token) do nothing
       returning ${TOKEN_COLS}`,
      [token, exp ? exp.toISOString() : null, exp && exp.getTime() <= Date.now() ? "expired" : "unknown", claims.sub ?? null],
    );
    if (rows[0]) {
      added.push(rows[0]);
      if (claims.sub) known.set(claims.sub, rows[0].account_email || "บัญชีที่เพิ่งเพิ่ม");
    } else duplicates.push(`${masked} (มี token นี้อยู่แล้ว)`);
  }
  return { added, duplicates };
}

export async function claimDailyFor(tokens: TokenRow[]) {
  const today = resetDayKey();
  const groups = groupByAccount(tokens.filter(isTokenUsable));
  let gained = 0;
  let claimed = 0;
  let skipped = 0;
  const failures: { id: number; message: string }[] = [];
  const pending: string[] = [];

  for (const [key, list] of groups) {
    if (list.some((t) => t.daily_claimed_on === today)) continue;
    pending.push(key);
    const ids = list.map((t) => t.id);
    try {
      const state = await readDaily(list[0].token, list[0].device_uuid).catch(() => null);
      if (state?.today?.state === "done") {
        await q(`update tokens set daily_claimed_on = $2 where id = any($1::int[])`, [ids, today]);
        skipped++;
        continue;
      }
      const reward = await claimDaily(list[0].token, list[0].device_uuid);
      gained += reward.gained;
      claimed++;
      await q(
        `update tokens set daily_claimed_on = $2,
           credits = coalesce($3, credits), checked_at = now(), status = 'ok'
         where id = any($1::int[])`,
        [ids, today, reward.balance],
      );
    } catch (err) {
      failures.push({ id: list[0].id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { claimed, gained, skipped, failed: failures.length, failures, pending: pending.length };
}

export async function createResult(input: {
  jobId: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  aspect: string;
  resolution: string;
  cost: number;
  tokenId: number;
  refs: RefFile[];
}) {
  const rows = await q<ResultRow>(
    `insert into results (job_id, prompt, model_id, model_label, aspect, resolution, cost, token_id, refs, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'pending')
     on conflict (job_id) do update set job_id = excluded.job_id
     returning ${RESULT_COLS}`,
    [
      input.jobId,
      input.prompt,
      input.modelId,
      input.modelLabel,
      input.aspect,
      input.resolution,
      input.cost,
      input.tokenId,
      JSON.stringify(input.refs),
    ],
  );
  await q(
    `update tokens set last_used_at = now(), generated_count = generated_count + 1,
       credits = greatest(coalesce(credits, $2) - $2, 0)
     where id = $1
        or account_id = (select account_id from tokens where id = $1 and account_id is not null)`,
    [input.tokenId, input.cost],
  );
  return rows[0];
}

export const resultByJob = async (jobId: string) =>
  (await q<ResultRow>(`select ${RESULT_COLS} from results where job_id = $1`, [jobId]))[0];

export async function completeResult(id: number, url: string) {
  const rows = await q<ResultRow>(
    `update results set status = 'completed', url = $2, completed_at = now(),
       duration_ms = (extract(epoch from (now() - created_at)) * 1000)::int
     where id = $1 returning ${RESULT_COLS}`,
    [id, url],
  );
  return rows[0];
}

export async function failResult(id: number, error: string) {
  const rows = await q<ResultRow>(
    `update results set status = 'failed', error = $2, completed_at = now() where id = $1 returning ${RESULT_COLS}`,
    [id, error.slice(0, 500)],
  );
  return rows[0];
}

export const publicResults = (limit = 48) =>
  q<ResultRow>(
    `select ${RESULT_COLS} from results
     where status = 'completed' and deleted_at is null and url is not null
     order by created_at desc limit $1`,
    [Math.min(Math.max(limit, 1), 120)],
  );

export const publicResult = (r: ResultRow) => ({
  id: r.id,
  url: r.url!,
  prompt: r.prompt,
  modelId: r.model_id,
  modelLabel: r.model_label,
  aspect: r.aspect,
  resolution: r.resolution,
  cost: r.cost,
  createdAt: r.created_at,
  refCount: Array.isArray(r.refs) ? r.refs.length : 0,
});

export type PublicResult = ReturnType<typeof publicResult>;

export type ResultQuery = {
  search?: string;
  model?: string;
  status?: string;
  sort?: "created_at" | "cost" | "duration_ms";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export async function adminResults(query: ResultQuery) {
  const where: string[] = ["deleted_at is null"];
  const params: unknown[] = [];
  if (query.search?.trim()) {
    params.push(`%${query.search.trim()}%`);
    where.push(`(prompt ilike $${params.length} or model_label ilike $${params.length})`);
  }
  if (query.model && query.model !== "all") {
    params.push(query.model);
    where.push(`model_id = $${params.length}`);
  }
  if (query.status && query.status !== "all") {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  const sort = ["created_at", "cost", "duration_ms"].includes(query.sort || "") ? query.sort! : "created_at";
  const dir = query.dir === "asc" ? "asc" : "desc";
  const pageSize = Math.min(Math.max(query.pageSize ?? 24, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await q<ResultRow>(
    `select ${RESULT_COLS} from results where ${where.join(" and ")}
     order by ${sort} ${dir} nulls last, id desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const [{ count }] = await q<{ count: number }>(
    `select count(*)::int as count from results where ${where.join(" and ")}`,
    params.slice(0, params.length - 2),
  );
  return { rows, count, page, pageSize };
}

export const markResultsDeleted = (ids: number[]) =>
  q<{ id: number }>(`update results set deleted_at = now() where id = any($1::int[]) returning id`, [ids]);

export const restoreResults = (ids: number[]) =>
  q<{ id: number }>(`update results set deleted_at = null where id = any($1::int[]) returning id`, [ids]);

export async function adminStats() {
  const since = ictDayStart().toISOString();
  const [totals] = await q<{
    images: number;
    spent: number;
    images_today: number;
    spent_today: number;
    pending: number;
    failed: number;
    with_refs: number;
  }>(
    `select
       count(*) filter (where status = 'completed')::int as images,
       coalesce(sum(cost) filter (where status = 'completed'), 0)::int as spent,
       count(*) filter (where status = 'completed' and created_at >= $1)::int as images_today,
       coalesce(sum(cost) filter (where status = 'completed' and created_at >= $1), 0)::int as spent_today,
       count(*) filter (where status = 'pending')::int as pending,
       count(*) filter (where status = 'failed')::int as failed,
       count(*) filter (where status = 'completed' and jsonb_array_length(refs) > 0)::int as with_refs
     from results where deleted_at is null`,
    [since],
  );
  const byModel = await q<{ model_label: string; count: number; spent: number }>(
    `select model_label, count(*)::int as count, coalesce(sum(cost),0)::int as spent
     from results where deleted_at is null and status = 'completed'
     group by model_label order by count desc`,
  );
  const daily = await q<{ day: string; count: number; spent: number }>(
    `select to_char(created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as day,
            count(*)::int as count, coalesce(sum(cost),0)::int as spent
     from results
     where deleted_at is null and status = 'completed' and created_at >= now() - interval '14 days'
     group by 1 order by 1`,
  );
  return { totals, byModel, daily };
}