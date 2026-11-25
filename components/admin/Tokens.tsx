"use client";

import { useMemo, useRef, useState } from "react";
import { MIN_COST, resetDayKey } from "@/lib/models";
import { isGrabmailAddress } from "@/lib/mail-domains";
import {
  Alert,
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Gift,
  Key,
  Pencil,
  Plus,
  Refresh,
  Search,
  Sort,
  Trash,
  X,
} from "@/components/icons";
import { api, copyText, fmtDay, fmtNum, Modal, Time, useErrorTrap, useUI } from "@/components/ui";
import type { AdminToken, DailyReport, Summary, TokenPayload } from "./types";

type SortKey = "account_email" | "credits" | "expires_at" | "generated_count" | "checked_at";

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: "พร้อมใช้", cls: "ok" },
  invalid: { label: "token ใช้ไม่ได้", cls: "bad" },
  expired: { label: "หมดอายุ", cls: "bad" },
  error: { label: "เช็คไม่สำเร็จ", cls: "warn" },
  unknown: { label: "ยังไม่เช็ค", cls: "" },
};

const statusOf = (t: AdminToken) =>
  !t.enabled ? { label: "ปิดใช้", cls: "off" } : STATUS[t.status] || STATUS.unknown;

export const accountName = (t: AdminToken) => t.account_email || `บัญชี #${t.id}`;
/** รี token อัตโนมัติได้เฉพาะอีเมลที่อ่านกล่องได้ผ่าน Grabmail */
const renewable = (t: AdminToken) => isGrabmailAddress(t.account_email);

export function Tokens({
  tokens,
  summary,
  apply,
  reload,
  onAuthLost,
}: {
  tokens: AdminToken[];
  summary: Summary | null;
  apply: (data: TokenPayload) => void;
  reload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const { toast, confirm } = useUI();
  const trap = useErrorTrap(onAuthLost);
  const today = resetDayKey();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "credits", dir: "desc" });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [renewNote, setRenewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminToken | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tokens.filter((t) => {
      const matchQ =
        !q ||
        (t.account_email || "").toLowerCase().includes(q) ||
        t.token.toLowerCase().includes(q) ||
        statusOf(t).label.includes(q);
      const matchF =
        filter === "all" ||
        (filter === "off" ? !t.enabled : filter === "daily" ? t.enabled && t.daily_claimed_on !== today : t.enabled && t.status === filter);
      return matchQ && matchF;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "account_email") return (a.account_email || "").localeCompare(b.account_email || "", "th") * dir;
      const av = (a[sort.key] as number | null) ?? -1;
      const bv = (b[sort.key] as number | null) ?? -1;
      return (av - bv) * dir;
    });
  }, [filter, query, sort, today, tokens]);

  const ceiling = Math.max(110, ...tokens.map((t) => t.credits ?? 0));
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const selected = tokens.filter((t) => picked.has(t.id));

  const accountCounts = useMemo(() => {
    const map = new Map<string, number>();
    tokens.forEach((t) => {
      const key = t.account_id || `token:${t.id}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [tokens]);
  const dupAccounts = [...accountCounts.values()].filter((n) => n > 1).length;
  const keyOf = (t: AdminToken) => t.account_id || `token:${t.id}`;

  const toggle = (id: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      trap(err);
    } finally {
      setBusy(null);
    }
  };

  const refresh = (ids?: number[]) =>
    run(ids ? `refresh-${ids.join()}` : "refresh-all", async () => {
      const data = await api<TokenPayload>("/api/admin/refresh", { method: "POST", json: { ids } });
      apply(data);
      toast(ids ? `เช็คเครดิต ${ids.length} บัญชีแล้ว` : "เช็คเครดิตทุกบัญชีแล้ว", "ok");
    });

  const daily = (ids?: number[]) =>
    run("daily", async () => {
      const data = await api<TokenPayload & { report: DailyReport }>("/api/admin/daily", {
        method: "POST",
        json: { ids },
      });
      apply(data);
      const r = data.report;
      if (r.claimed) toast(`รับเดลีสำเร็จ ${r.claimed} บัญชี +${fmtNum(r.gained)} เครดิต`, "ok");
      else if (r.skipped && !r.failed) toast("ทุกบัญชีรับเดลีของรอบนี้ไปแล้ว", "info");
      else if (r.failed) toast(`รับเดลีไม่สำเร็จ ${r.failed} บัญชี — ${r.failures[0]?.message || ""}`, "warn");
      else toast("ไม่มีบัญชีที่ต้องรับเดลี", "info");
    });

  const patch = (id: number, body: Record<string, unknown>, note: string) =>
    run(`patch-${id}`, async () => {
      apply(await api<TokenPayload>(`/api/admin/tokens/${id}`, { method: "PATCH", json: body }));
      toast(note, "ok");
    });

  const remove = async (list: AdminToken[]) => {
    const ok = await confirm({
      title: list.length === 1 ? `ลบบัญชี ${accountName(list[0])}?` : `ลบ ${list.length} บัญชี?`,
      body: "เครดิตที่เหลือของบัญชีนี้จะหายจากการใช้งานทันที (ภาพที่สร้างไว้ยังอยู่ครบ) กู้คืนได้จากการกดเลิกทำในการแจ้งเตือน",
      okLabel: "ลบเลย",
      danger: true,
    });
    if (!ok) return;
    await run("delete", async () => {
      const removed: AdminToken[] = [];
      for (const t of list) {
        const data = await api<{ removed: AdminToken } & TokenPayload>(`/api/admin/tokens/${t.id}`, { method: "DELETE" });
        removed.push(data.removed);
        apply(data);
      }
      setPicked(new Set());
      toast(`ลบ ${removed.length} บัญชีแล้ว`, "warn", () => {
        void run("undo", async () => {
          const data = await api<{ added: number } & TokenPayload>("/api/admin/tokens", {
            method: "POST",
            json: { raw: removed.map((t) => t.token).join("\n"), allowAccountDuplicates: true },
          });
          apply(data);
          await reload();
          toast(`กู้คืน ${data.added} บัญชีแล้ว`, "ok");
        });
      });
    });
  };

  const removeDupes = async () => {
    const groups = new Map<string, AdminToken[]>();
    tokens.forEach((t) => {
      const key = t.account_id || `token:${t.id}`;
      groups.set(key, [...(groups.get(key) || []), t]);
    });
    const extra = [...groups.values()]
      .filter((g) => g.length > 1)
      .flatMap((g) => [...g].sort((a, b) => b.id - a.id).slice(1));
    if (!extra.length) return;
    const ok = await confirm({
      title: `ลบ token ซ้ำ ${extra.length} ตัว?`,
      body: `จะเก็บ token ใหม่สุดของแต่ละบัญชีไว้ 1 ตัว — เครดิตไม่หาย เพราะ token ที่ซ้ำเป็นบัญชีเดียวกัน`,
      okLabel: "ลบ token ซ้ำ",
      danger: true,
    });
    if (!ok) return;
    await run("dedupe", async () => {
      for (const t of extra) {
        apply(await api<TokenPayload>(`/api/admin/tokens/${t.id}`, { method: "DELETE" }));
      }
      setPicked(new Set());
      toast(`ลบ token ซ้ำ ${extra.length} ตัวแล้ว — เหลือบัญชีละ 1 token`, "ok");
    });
  };

  const renewMany = (targets: AdminToken[]) => {
    void (async () => {
      if (!targets.length) {
        toast("ในรายการที่เลือกไม่มีบัญชี @grabmail.io ให้รี", "warn");
        return;
      }
      const ok = await confirm({
        title: targets.length === 1 ? `รี token ของ ${accountName(targets[0])}?` : `รี token ${targets.length} บัญชี?`,
        body:
          targets.length === 1
            ? "ระบบจะขอ OTP ใหม่ อ่านเมลจาก Grabmail อัตโนมัติ แล้วแทนที่ token เดิมด้วยตัวที่อายุยาวขึ้น"
            : "ทำพร้อมกัน 5 บัญชี (ขอ OTP + อ่านเมลอัตโนมัติ) — บัญชีที่ไม่ใช้อีเมล Grabmail จะถูกข้าม",
        okLabel: "เริ่มรี token",
      });
      if (!ok) return;

      const lanes = Math.min(5, targets.length);
      setBusy("renew-bulk");
      setRenewNote(`เริ่มรี ${targets.length} บัญชี · พร้อมกัน ${lanes}`);
      let cursor = 0;
      let done = 0;
      let failed = 0;

      const worker = async (lane: number) => {
        await new Promise((r) => setTimeout(r, lane * 600));
        for (;;) {
          const i = cursor++;
          if (i >= targets.length) return;
          try {
            await api(`/api/admin/tokens/${targets[i].id}/renew`, { method: "POST" });
            done++;
          } catch (err) {
            failed++;
            if (failed === 1) trap(err);
          }
          setRenewNote(
            `รีเสร็จ ${done + failed}/${targets.length} · สำเร็จ ${done}${failed ? ` · พลาด ${failed}` : ""}`,
          );
        }
      };

      await Promise.all(Array.from({ length: lanes }, (_, lane) => worker(lane)));
      await reload().catch(() => {});
      setBusy(null);
      setRenewNote("");
      toast(
        failed ? `รี token สำเร็จ ${done} · พลาด ${failed} บัญชี` : `รี token สำเร็จ ${done} บัญชี`,
        failed ? "warn" : "ok",
      );
    })();
  };

  const renewSelected = () => renewMany(selected.filter(renewable));

  const th = (key: SortKey, label: string) => (
    <th
      className="sortable"
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label} {sort.key === key ? (sort.dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="toolbar">
        <div className="searchbar grow">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อบัญชี / ท้าย token / สถานะ…"
            aria-label="ค้นหาบัญชี"
          />
          {query && (
            <button className="iconbtn sm" onClick={() => setQuery("")} aria-label="ล้างคำค้นหา">
              <X />
            </button>
          )}
        </div>
        <select className="sel" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="กรองสถานะบัญชี">
          <option value="all">ทุกสถานะ ({tokens.length})</option>
          <option value="ok">พร้อมใช้</option>
          <option value="daily">เดลีที่ยังไม่รับ</option>
          <option value="invalid">token ใช้ไม่ได้</option>
          <option value="expired">หมดอายุ</option>
          <option value="error">เช็คไม่สำเร็จ</option>
          <option value="off">ปิดใช้</option>
        </select>
        <button className="btn" onClick={() => void refresh()} disabled={!!busy}>
          <Refresh className={busy === "refresh-all" ? "spin" : undefined} /> เช็คเครดิตทั้งหมด
        </button>
        <button className="btn" onClick={() => void daily()} disabled={!!busy}>
          {busy === "daily" ? <span className="spinner" /> : <Gift />} รับเดลีทั้งหมด
          {!!summary?.dailyPending && <span className="pill chem">{summary.dailyPending}</span>}
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Plus /> เพิ่ม token
        </button>
        {dupAccounts > 0 && (
          <button
            className="btn"
            onClick={() => void removeDupes()}
            disabled={!!busy}
            title="หลาย token ของบัญชีเดียวกันใช้เครดิตกองเดียวกัน — เก็บไว้บัญชีละ 1 token"
          >
            <Trash /> ลบ token ซ้ำ ({dupAccounts})
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="toolbar" style={{ background: "var(--safe-wash)" }}>
          <span className="pill chem">
            <Check /> เลือก {selected.length} บัญชี
          </span>
          <span className="grow" />
          <button className="btn sm" onClick={() => void refresh(selected.map((t) => t.id))} disabled={!!busy}>
            <Refresh /> เช็คเครดิต
          </button>
          <button className="btn sm" onClick={() => void daily(selected.map((t) => t.id))} disabled={!!busy}>
            <Gift /> รับเดลี
          </button>
          <button
            className="btn sm"
            onClick={renewSelected}
            disabled={!!busy || !selected.some(renewable)}
            title="รี token อัตโนมัติได้เฉพาะบัญชี @grabmail.io"
          >
            <Clock /> รี token ({selected.filter(renewable).length})
          </button>
          {renewNote && <span className="mono" style={{ color: "var(--paper-2)" }}>{renewNote}</span>}
          <button
            className="btn sm"
            onClick={() =>
              void run("bulk-toggle", async () => {
                for (const t of selected) {
                  apply(await api<TokenPayload>(`/api/admin/tokens/${t.id}`, { method: "PATCH", json: { enabled: true } }));
                }
                toast(`เปิดใช้ ${selected.length} บัญชีแล้ว`, "ok");
              })
            }
            disabled={!!busy}
          >
            <Check /> เปิดใช้
          </button>
          <button
            className="btn sm"
            onClick={() =>
              void run("bulk-toggle", async () => {
                for (const t of selected) {
                  apply(await api<TokenPayload>(`/api/admin/tokens/${t.id}`, { method: "PATCH", json: { enabled: false } }));
                }
                toast(`ปิดใช้ ${selected.length} บัญชีแล้ว`, "warn");
              })
            }
            disabled={!!busy}
          >
            <X /> ปิดใช้
          </button>
          <button className="btn sm danger" onClick={() => void remove(selected)} disabled={!!busy}>
            <Trash /> ลบที่เลือก
          </button>
          <button className="btn sm ghost" onClick={() => setPicked(new Set())}>
            ล้างการเลือก
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <Key />
          {tokens.length === 0
            ? "ยังไม่มีบัญชีในระบบ — กด “เพิ่ม token” แล้ววาง JWT ทีละบรรทัด"
            : "ไม่พบบัญชีที่ตรงกับคำค้นหรือตัวกรองนี้"}
        </div>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 38 }}>
                  <input
                    type="checkbox"
                    className="cb"
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
                    aria-label="เลือกทุกบัญชีที่แสดง"
                  />
                </th>
                {th("account_email", "บัญชี (อีเมล)")}
                <th>token</th>
                {th("credits", "เครดิต")}
                <th>สถานะ</th>
                <th>เดลีรอบนี้</th>
                {th("expires_at", "หมดอายุ")}
                {th("generated_count", "สร้างแล้ว")}
                {th("checked_at", "เช็คล่าสุด")}
                <th style={{ textAlign: "right" }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const st = statusOf(t);
                const claimed = t.daily_claimed_on === today;
                const expSoon = t.expires_at !== null && t.expires_at - Date.now() < 7 * 86400e3;
                const shown = revealed.has(t.id);
                return (
                  <tr key={t.id} className={picked.has(t.id) ? "sel" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        className="cb"
                        checked={picked.has(t.id)}
                        onChange={() => toggle(t.id)}
                        aria-label={`เลือก ${accountName(t)}`}
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <b style={{ fontWeight: 600 }}>{accountName(t)}</b>
                        <button className="iconbtn sm" onClick={() => setEditing(t)} aria-label={`แก้ไข ${accountName(t)}`}>
                          <Pencil />
                        </button>
                      </div>
                      <div className="mono" style={{ color: "var(--paper-4)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 3 }}>
                        <span>#{t.id}</span>
                        {!t.account_email && <span title="ยังไม่ได้เช็คบัญชี — กดเช็คเครดิตเพื่ออ่านอีเมล">ยังไม่รู้อีเมล</span>}
                        {accountCounts.get(keyOf(t))! > 1 && (
                          <span className="pill warn" title="token หลายตัวของบัญชีนี้ใช้เครดิตกองเดียวกัน — นับเครดิตครั้งเดียว">
                            บัญชีซ้ำ {accountCounts.get(keyOf(t))}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="mono">{shown ? t.token.slice(0, 14) + "…" : "••••••••" + t.token.slice(-6)}</span>
                        <button
                          className="iconbtn sm"
                          onClick={() =>
                            setRevealed((s) => {
                              const next = new Set(s);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            })
                          }
                          aria-label={shown ? "ซ่อน token" : "แสดง token"}
                        >
                          {shown ? <EyeOff /> : <Eye />}
                        </button>
                        <button
                          className="iconbtn sm"
                          onClick={async () => toast((await copyText(t.token)) ? "คัดลอก token แล้ว" : "คัดลอกไม่สำเร็จ", "ok")}
                          aria-label="คัดลอก token"
                        >
                          <Copy />
                        </button>
                      </div>
                      {shown && (
                        <div className="mono" style={{ color: "var(--paper-4)", maxWidth: 260, wordBreak: "break-all", marginTop: 4 }}>
                          {t.token}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>
                        {fmtNum(t.credits)}
                      </span>
                      {t.credits !== null && t.credits < MIN_COST && (
                        <span className="pill off" title={`ต่ำกว่า ${MIN_COST} เครดิต — สร้างภาพไม่ได้ จึงนับเป็น 0`} style={{ marginLeft: 6 }}>
                          นับเป็น 0
                        </span>
                      )}
                      <div className="creditbar">
                        <i style={{ width: `${Math.min(100, ((t.credits ?? 0) / ceiling) * 100)}%` }} />
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${st.cls}`}>
                        <i /> {st.label}
                      </span>
                    </td>
                    <td>
                      {claimed ? (
                        <span className="pill ok">
                          <Check style={{ width: 10, height: 10 }} /> รับแล้ว
                        </span>
                      ) : (
                        <button className="btn sm" onClick={() => void daily([t.id])} disabled={!!busy || !t.enabled}>
                          <Gift /> รับเดลี
                        </button>
                      )}
                    </td>
                    <td className="num" style={{ color: expSoon ? "var(--warn)" : undefined }}>
                      {t.expires_at ? fmtDay(t.expires_at) : "—"}
                      {expSoon && <div className="mono" style={{ fontSize: 10 }}>ใกล้หมดอายุ</div>}
                    </td>
                    <td className="num">{fmtNum(t.generated_count)}</td>
                    <td className="mono" style={{ color: "var(--paper-3)" }}>
                      {t.checked_at ? <Time ms={t.checked_at} /> : "—"}
                    </td>
                    <td>
                      <div className="rowacts">
                        {renewable(t) && (
                          <button
                            className="iconbtn sm"
                            onClick={() => renewMany([t])}
                            disabled={!!busy}
                            aria-label={`รี token ${accountName(t)}`}
                            title="รี token (ขอ OTP ใหม่ทาง Grabmail)"
                          >
                            <Clock />
                          </button>
                        )}
                        <button
                          className={`iconbtn sm ${busy === `refresh-${t.id}` ? "busy" : ""}`}
                          onClick={() => void refresh([t.id])}
                          disabled={!!busy}
                          aria-label={`เช็คเครดิต ${accountName(t)}`}
                          title="เช็คเครดิตบัญชีนี้"
                        >
                          <Refresh />
                        </button>
                        <button
                          className="iconbtn sm"
                          onClick={() => void patch(t.id, { enabled: !t.enabled }, t.enabled ? `ปิดใช้ ${accountName(t)} แล้ว` : `เปิดใช้ ${accountName(t)} แล้ว`)}
                          disabled={!!busy}
                          aria-label={t.enabled ? `ปิดใช้ ${accountName(t)}` : `เปิดใช้ ${accountName(t)}`}
                          title={t.enabled ? "ปิดใช้บัญชีนี้" : "เปิดใช้บัญชีนี้"}
                        >
                          {t.enabled ? <EyeOff /> : <Eye />}
                        </button>
                        <button
                          className="iconbtn sm danger"
                          onClick={() => void remove([t])}
                          disabled={!!busy}
                          aria-label={`ลบ ${accountName(t)}`}
                          title="ลบบัญชีนี้"
                        >
                          <Trash />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="toolbar" style={{ borderBottom: "none", borderTop: "1px solid var(--line)" }}>
        <span className="mono" style={{ color: "var(--paper-3)" }}>
          <Sort style={{ width: 12, height: 12, verticalAlign: -2 }} /> {rows.length} token จากทั้งหมด {tokens.length} ·{" "}
          {summary?.accounts ?? 0} บัญชี · เครดิตรวมจริง {fmtNum(summary?.total)} · รีเซ็ตทุกวัน 11:00 น.
          <span style={{ color: "var(--paper-4)" }}> · รี token อัตโนมัติได้เฉพาะอีเมล Grabmail</span>
          {renewNote && <span style={{ color: "var(--paper)" }}> · {renewNote}</span>}
        </span>
      </div>

      {adding && (
        <AddTokens onClose={() => setAdding(false)} apply={apply} reload={reload} onAuthLost={onAuthLost} />
      )}
      {editing && (
        <EditToken
          token={editing}
          onClose={() => setEditing(null)}
          apply={apply}
          onAuthLost={onAuthLost}
          onDelete={() => {
            const t = editing;
            setEditing(null);
            void remove([t]);
          }}
        />
      )}
    </section>
  );
}

function AddTokens({
  onClose,
  apply,
  reload,
  onAuthLost,
}: {
  onClose: () => void;
  apply: (data: TokenPayload) => void;
  reload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const { toast } = useUI();
  const trap = useErrorTrap(onAuthLost);
  const [mode, setMode] = useState<"paste" | "create">("paste");
  const [raw, setRaw] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });
  const [making, setMaking] = useState<
    { key: number; email: string; state: "queue" | "run" | "ok" | "bad"; msg?: string }[]
  >([]);
  const rowsState = useRef(new Map<number, "queue" | "run" | "ok" | "bad">());
  const parsed = raw.split(/\r?\n/).filter((l) => l.split("|")[0].trim().startsWith("eyJ")).length;

  const savePaste = async () => {
    setBusy(true);
    try {
      const data = await api<{ added: number; duplicates: string[] } & TokenPayload>("/api/admin/tokens", {
        method: "POST",
        json: { raw },
      });
      apply(data);
      if (data.added) {
        toast(`เพิ่ม ${data.added} บัญชีแล้ว${data.duplicates.length ? ` · ข้ามซ้ำ ${data.duplicates.length}` : ""}`, "ok");
        onClose();
      } else if (data.duplicates.length) {
        toast(`ไม่ได้เพิ่ม: ${data.duplicates[0]}`, "warn");
        setBusy(false);
      } else {
        toast("ไม่พบ token ที่ถูกต้องในช่องที่วาง", "warn");
        setBusy(false);
      }
    } catch (err) {
      trap(err);
      setBusy(false);
    }
  };

  const createMany = async () => {
    const total = Math.min(Math.max(Math.round(count) || 1, 1), 20);
    const lanes = Math.min(5, total);
    const keys = Array.from({ length: total }, (_, i) => Date.now() + i);
    rowsState.current.clear();
    keys.forEach((k) => rowsState.current.set(k, "queue"));
    setMaking(keys.map((key) => ({ key, email: "รอคิว…", state: "queue" })));
    setProgress({ done: 0, failed: 0 });
    setBusy(true);

    let cursor = 0;
    let done = 0;
    let failed = 0;
    const patch = (key: number, next: Partial<{ email: string; state: "queue" | "run" | "ok" | "bad"; msg: string }>) => {
      if (next.state) rowsState.current.set(key, next.state);
      setMaking((list) => list.map((r) => (r.key === key ? { ...r, ...next } : r)));
    };

    const worker = async (lane: number) => {
      await new Promise((r) => setTimeout(r, lane * 700));
      for (;;) {
        const i = cursor++;
        if (i >= total) return;
        const key = keys[i];
        patch(key, { state: "run", email: "กำลังสร้างบัญชี…" });
        try {
          const data = await api<{ created: { id: number; email: string | null } }>("/api/admin/create-token", {
            method: "POST",
          });
          patch(key, { state: "ok", email: data.created.email || `#${data.created.id}` });
          done++;
        } catch (err) {
          patch(key, { state: "bad", msg: err instanceof Error ? err.message : "สร้างไม่สำเร็จ" });
          failed++;
        }
        setProgress({ done, failed });
      }
    };

    await Promise.all(Array.from({ length: lanes }, (_, lane) => worker(lane)));

    // รอบสอง: ลองใหม่เฉพาะใบที่พลาด (มักโดน rate limit) แบบเว้นจังหวะ
    const retry = keys.filter((k) => rowsState.current.get(k) === "bad");
    for (const [n, key] of retry.entries()) {
      if (n > 0) await new Promise((r) => setTimeout(r, 1800));
      patch(key, { state: "run", email: "กำลังลองใหม่…", msg: "" });
      try {
        const data = await api<{ created: { id: number; email: string | null } }>("/api/admin/create-token", {
          method: "POST",
        });
        patch(key, { state: "ok", email: data.created.email || `#${data.created.id}` });
        done++;
        failed--;
      } catch (err) {
        patch(key, { state: "bad", msg: err instanceof Error ? err.message : "สร้างไม่สำเร็จ" });
      }
      setProgress({ done, failed });
    }

    await reload().catch(() => {});
    setBusy(false);
    const totalCreated = keys.filter((k) => rowsState.current.get(k) === "ok").length;
    toast(
      totalCreated === total
        ? `สร้างบัญชีใหม่ครบ ${totalCreated} บัญชี (พร้อมกัน ${lanes} ใบ)`
        : `สร้างสำเร็จ ${totalCreated} จาก ${total} บัญชี — ที่เหลือกดสร้างซ้ำได้`,
      totalCreated === total ? "ok" : "warn",
    );
  };

  return (
    <Modal
      title="เพิ่ม token"
      icon={<Key />}
      onClose={onClose}
      footer={
        mode === "paste" ? (
          <>
            <button className="btn ghost" onClick={onClose}>
              ปิด
            </button>
            <button className="btn primary" onClick={() => void savePaste()} disabled={!parsed || busy}>
              {busy ? <span className="spinner" /> : <Plus />} เพิ่ม {parsed || ""} บัญชี
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              ปิด
            </button>
            <button className="btn primary" onClick={() => void createMany()} disabled={busy || count < 1}>
              {busy ? <span className="spinner" /> : <Plus />} สร้าง{" "}
              {Math.min(Math.max(Math.round(count) || 1, 1), 20)} บัญชี
            </button>
          </>
        )
      }
    >
      <div className="block">
        <div className="seg" role="group" aria-label="วิธีเพิ่ม token">
          <button aria-pressed={mode === "paste"} onClick={() => setMode("paste")} disabled={busy}>
            วาง token
          </button>
          <button aria-pressed={mode === "create"} onClick={() => setMode("create")} disabled={busy}>
            สร้างบัญชีใหม่
          </button>
        </div>
      </div>

      {mode === "paste" ? (
        <>
          <div className="block">
            <label className="lbl" htmlFor="tok-raw">
              วาง token ทีละบรรทัด
            </label>
            <textarea
              id="tok-raw"
              className="inp"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && parsed && !busy) void savePaste();
              }}
              placeholder={"eyJhbGciOi...\neyJhbGciOi... | หมดอายุ: 2026-12-15 17:04 | เครดิต: 110"}
              spellCheck={false}
              data-autofocus
            />
            <p className="help">
              ก็อปจาก cookie <span className="mono">access-token</span> ของเว็บต้นทาง · อ่านเฉพาะส่วนหน้าเครื่องหมาย |
              · ตั้งชื่อบัญชีตามอีเมลให้เอง · ตัด token ซ้ำบัญชีให้อัตโนมัติ
            </p>
            <p className="help" style={{ color: "var(--paper-2)" }}>
              พบ {parsed} token ที่ถูกต้อง
            </p>
          </div>
          <div className="alert info">
            <Alert />
            <span>token ถูกเก็บในฐานข้อมูลฝั่งเซิร์ฟเวอร์เท่านั้น ไม่มีทางหลุดไปหน้าผู้ใช้</span>
          </div>
        </>
      ) : (
        <>
          <div className="block">
            <label className="lbl" htmlFor="mk-count">
              จำนวนบัญชีที่จะสร้าง (1–20)
            </label>
            <input
              id="mk-count"
              className="inp"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              style={{ width: 110 }}
              disabled={busy}
              data-autofocus
            />
            <p className="help">
              สร้างอีเมลชั่วคราวจาก Grabmail (<span className="mono">linqmail.com</span> /{" "}
              <span className="mono">mixozia.com</span>) แล้วยืนยัน OTP อัตโนมัติ · สร้างพร้อมกัน 5 บัญชีต่อรอบ ·
              ประมาณ 10–40 วินาทีต่อรอบ
            </p>
          </div>

          {making.length > 0 && (
            <>
              <div className="field-label" style={{ marginTop: 4 }}>
                ความคืบหน้า
                <span className="hint">
                  สำเร็จ {progress.done} · พลาด {progress.failed} · ทั้งหมด {making.length}
                </span>
              </div>
              <div className="mk-list">
                {making.map((r) => (
                  <div className="mk-row" key={r.key}>
                    {r.state === "run" ? (
                      <span className="spinner" />
                    ) : r.state === "ok" ? (
                      <Check style={{ color: "var(--ok)" }} />
                    ) : r.state === "bad" ? (
                      <X style={{ color: "var(--bad)" }} />
                    ) : (
                      <Clock style={{ color: "var(--paper-4)" }} />
                    )}
                    <span className="mono" style={{ color: r.state === "queue" ? "var(--paper-4)" : undefined }}>
                      {r.email}
                    </span>
                    {r.state === "bad" && <span className="pill bad">{r.msg?.slice(0, 40)}</span>}
                    {r.state === "ok" && <span className="pill ok">สำเร็จ</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="alert warn">
            <Alert />
            <span>
              บัญชีที่สร้างจะได้เครดิตเริ่มต้นจาก Overchat และรีเซ็ตเดลีทุกวัน 11:00 น. · รี token ภายหลังได้เฉพาะอีเมล
              Grabmail ที่ระบบสร้างให้
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}

function EditToken({
  token,
  onClose,
  apply,
  onAuthLost,
  onDelete,
}: {
  token: AdminToken;
  onClose: () => void;
  apply: (data: TokenPayload) => void;
  onAuthLost: () => void;
  onDelete: () => void;
}) {
  const { toast } = useUI();
  const trap = useErrorTrap(onAuthLost);
  const [enabled, setEnabled] = useState(token.enabled);
  const [replacement, setReplacement] = useState("");
  const [rotate, setRotate] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = enabled !== token.enabled || rotate || replacement.trim().length > 0;

  const save = async () => {
    const body: Record<string, unknown> = {};
    if (enabled !== token.enabled) body.enabled = enabled;
    if (rotate) body.rotateUuid = true;
    if (replacement.trim()) body.token = replacement.trim();
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    try {
      apply(await api<TokenPayload>(`/api/admin/tokens/${token.id}`, { method: "PATCH", json: body }));
      toast("บันทึกการแก้ไขแล้ว", "ok");
      onClose();
    } catch (err) {
      trap(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`บัญชี ${accountName(token)}`}
      icon={<Pencil />}
      onClose={onClose}
      footer={
        <>
          <button className="btn danger" onClick={onDelete} style={{ marginRight: "auto" }}>
            <Trash /> ลบบัญชีนี้
          </button>
          <button className="btn ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={!dirty || busy}>
            {busy ? <span className="spinner" /> : <Check />} บันทึก
          </button>
        </>
      }
    >
      <div className="block">
        <div className="field-label">
          <Key /> บัญชีปลายทาง
        </div>
        <p style={{ fontSize: 13.5, color: "var(--paper)" }}>
          {token.account_email || "ยังไม่รู้อีเมล — กดเช็คเครดิตก่อน"}
        </p>
        <p className="help">
          ระบบใช้ <span className="mono">account id</span> จากตัว token เป็นตัวนับเครดิต · token #{token.id}
        </p>
      </div>

      <div className="block">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="track" />
          เปิดใช้บัญชีนี้ในการสร้างภาพ
        </label>
        <p className="help">ปิดไว้เพื่อกันบัญชีที่อยากเก็บเครดิตสำรอง โดยไม่ต้องลบทิ้ง</p>
      </div>

      <div className="block">
        <label className="lbl" htmlFor="edit-token">
          เปลี่ยน token (เว้นว่างถ้าไม่เปลี่ยน)
        </label>
        <textarea
          id="edit-token"
          className="inp"
          style={{ minHeight: 72 }}
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="วาง token ใหม่เมื่ออันเดิมหมดอายุ"
          spellCheck={false}
          data-autofocus
        />
        <p className="help">
          หมดอายุเดิม: {token.expires_at ? <Time ms={token.expires_at} /> : "ไม่ทราบ"} · เปลี่ยนแล้วระบบจะอ่านบัญชี/อีเมล
          และเช็คเครดิตใหม่ให้ทันที
        </p>
      </div>

      <div className="block">
        <label className="switch">
          <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />
          <span className="track" />
          สุ่ม device uuid ใหม่
        </label>
        <p className="help">
          uuid ปัจจุบัน <span className="mono">{token.device_uuid}</span> — ใช้เมื่อปลายทางผูกอุปกรณ์แล้วเรียกไม่ได้
        </p>
      </div>
    </Modal>
  );
}