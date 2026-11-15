"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MODELS, type GalleryItem } from "@/lib/models";
import {
  Alert,
  Check,
  Clip,
  Clock,
  Copy,
  Download,
  External,
  Film,
  ImageIcon,
  Refresh,
  Search,
  Trash,
  X,
} from "@/components/icons";
import { Lightbox } from "@/components/Lightbox";
import {
  api,
  copyText,
  downloadUrl,
  fmtDur,
  fmtNum,
  Modal,
  Time,
  useErrorTrap,
  useUI,
} from "@/components/ui";
import type { AdminResult, AdminToken } from "./types";

type Page = { rows: AdminResult[]; count: number; page: number; pageSize: number };

const STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "เสร็จ", cls: "ok" },
  pending: { label: "กำลังสร้าง", cls: "warn" },
  failed: { label: "ล้มเหลว", cls: "bad" },
};

const asGallery = (r: AdminResult): GalleryItem => ({
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

export function Results({
  tokens,
  onChanged,
  onAuthLost,
}: {
  tokens: AdminToken[];
  onChanged: () => void;
  onAuthLost: () => void;
}) {
  const { toast, confirm } = useUI();
  const trap = useErrorTrap(onAuthLost);

  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [model, setModel] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"created_at" | "cost" | "duration_ms">("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<AdminResult | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 320);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    const id = ++reqId.current;
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      search: term,
      model,
      status,
      sort,
      dir,
      page: String(page),
      pageSize: "24",
    });
    api<Page>(`/api/admin/results?${params}`, { signal: ctrl.signal })
      .then((d) => {
        if (id === reqId.current) setData(d);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        trap(err);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
    return () => ctrl.abort();
  }, [dir, model, page, sort, status, term, tick, trap]);

  useEffect(() => {
    if (data && page > 1 && data.count <= (page - 1) * data.pageSize) setPage(1);
  }, [data, page]);

  const rows = data?.rows ?? [];
  const gallery = useMemo(() => rows.filter((r) => r.url).map(asGallery), [rows]);
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const tokenName = useCallback(
    (id: number | null) =>
      id === null ? "บัญชีถูกลบ" : tokens.find((t) => t.id === id)?.account_email || `บัญชี #${id}`,
    [tokens],
  );
  const pages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;

  const toggle = (id: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async (ids: number[]) => {
    const ok = await confirm({
      title: ids.length === 1 ? "ลบภาพนี้ออกจากคลัง?" : `ลบ ${ids.length} ภาพออกจากคลัง?`,
      body: "ภาพจะหายจากหน้าผู้ใช้ทันที แต่ยังกู้คืนได้จากการกดเลิกทำในการแจ้งเตือน",
      okLabel: "ลบเลย",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api<{ deleted: number[] }>("/api/admin/results", { method: "DELETE", json: { ids } });
      setPicked(new Set());
      setDetail(null);
      setTick((t) => t + 1);
      onChanged();
      toast(`ลบ ${ids.length} ภาพแล้ว`, "warn", () => {
        void (async () => {
          try {
            await api("/api/admin/results", { method: "POST", json: { ids } });
            setTick((t) => t + 1);
            onChanged();
            toast(`กู้คืน ${ids.length} ภาพแล้ว`, "ok");
          } catch (err) {
            trap(err);
          }
        })();
      });
    } catch (err) {
      trap(err);
    } finally {
      setBusy(false);
    }
  };

  const th = (key: typeof sort, label: string) => (
    <th
      className="sortable"
      onClick={() => {
        if (sort === key) setDir(dir === "desc" ? "asc" : "desc");
        else {
          setSort(key);
          setDir("desc");
        }
        setPage(1);
      }}
      aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label} {sort === key ? (dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="toolbar">
        <div className="searchbar grow">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาพรอมป์หรือชื่อโมเดล…"
            aria-label="ค้นหาภาพ"
          />
          {search && (
            <button className="iconbtn sm" onClick={() => setSearch("")} aria-label="ล้างคำค้นหา">
              <X />
            </button>
          )}
        </div>
        <select
          className="sel"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setPage(1);
          }}
          aria-label="กรองตามโมเดล"
        >
          <option value="all">ทุกโมเดล</option>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className="sel"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="กรองตามสถานะ"
        >
          <option value="all">ทุกสถานะ</option>
          <option value="completed">เสร็จแล้ว</option>
          <option value="pending">กำลังสร้าง</option>
          <option value="failed">ล้มเหลว</option>
        </select>
        <button className="btn" onClick={() => setTick((t) => t + 1)} disabled={loading}>
          <Refresh className={loading ? "spin" : undefined} /> รีเฟรช
        </button>
      </div>

      {picked.size > 0 && (
        <div className="toolbar" style={{ background: "var(--safe-wash)" }}>
          <span className="pill chem">
            <Check /> เลือก {picked.size} ภาพ
          </span>
          <span className="grow" />
          <button className="btn sm danger" onClick={() => void remove([...picked])} disabled={busy}>
            <Trash /> ลบที่เลือก
          </button>
          <button className="btn sm ghost" onClick={() => setPicked(new Set())}>
            ล้างการเลือก
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <Film />
          {loading ? "กำลังโหลดรายการ…" : "ไม่พบภาพที่ตรงกับเงื่อนไขนี้ — คลังจะเติมเองเมื่อมีการสร้างภาพใหม่"}
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
                    aria-label="เลือกทุกภาพในหน้านี้"
                  />
                </th>
                <th style={{ width: 62 }}>ภาพ</th>
                <th>พรอมป์</th>
                <th>โมเดล</th>
                <th>สัดส่วน</th>
                {th("cost", "เครดิต")}
                <th>สถานะ</th>
                <th>อ้างอิง</th>
                {th("duration_ms", "ใช้เวลา")}
                {th("created_at", "สร้างเมื่อ")}
                <th>บัญชี</th>
                <th style={{ textAlign: "right" }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] || STATUS.pending;
                const gi = gallery.findIndex((g) => g.id === r.id);
                return (
                  <tr key={r.id} className={picked.has(r.id) ? "sel" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        className="cb"
                        checked={picked.has(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`เลือกภาพ #${r.id}`}
                      />
                    </td>
                    <td>
                      {r.url ? (
                        <button
                          onClick={() => setLightbox(gi)}
                          aria-label={`ขยายภาพ #${r.id}`}
                          style={{ display: "block", padding: 0, lineHeight: 0 }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.url}
                            alt=""
                            loading="lazy"
                            style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line-2)" }}
                          />
                        </button>
                      ) : (
                        <span
                          style={{
                            width: 46,
                            height: 46,
                            display: "grid",
                            placeItems: "center",
                            borderRadius: 6,
                            border: "1px dashed var(--line-2)",
                            color: r.status === "failed" ? "var(--bad)" : "var(--paper-4)",
                          }}
                        >
                          {r.status === "failed" ? <Alert /> : <Clock />}
                        </span>
                      )}
                    </td>
                    <td style={{ maxWidth: 340 }}>
                      <button
                        onClick={() => setDetail(r)}
                        style={{ textAlign: "left", color: "var(--paper)", fontSize: 13, lineHeight: 1.5 }}
                        title="เปิดรายละเอียดภาพ"
                      >
                        {r.prompt.length > 110 ? r.prompt.slice(0, 110) + "…" : r.prompt}
                      </button>
                      {r.error && (
                        <div className="mono" style={{ color: "var(--bad)", fontSize: 10.5, marginTop: 3 }}>
                          {r.error.slice(0, 90)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="tag chem">{r.model_label}</span>
                    </td>
                    <td className="mono">
                      {r.aspect} · {r.resolution}
                    </td>
                    <td className="num">{r.cost}</td>
                    <td>
                      <span className={`pill ${st.cls}`}>
                        <i /> {st.label}
                      </span>
                    </td>
                    <td className="num">
                      {r.refs?.length ? (
                        <span className="pill film">
                          <Clip style={{ width: 10, height: 10 }} /> {r.refs.length}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">{fmtDur(r.duration_ms)}</td>
                    <td className="mono" style={{ color: "var(--paper-3)", whiteSpace: "nowrap" }}>
                      <Time ms={r.created_at} />
                    </td>
                    <td className="mono">{tokenName(r.token_id)}</td>
                    <td>
                      <div className="rowacts">
                        <button className="iconbtn sm" onClick={() => setDetail(r)} aria-label={`รายละเอียดภาพ #${r.id}`}>
                          <ImageIcon />
                        </button>
                        {r.url && (
                          <a
                            className="iconbtn sm"
                            href={downloadUrl(r.url, `genimgs-${r.id}`)}
                            download
                            aria-label={`ดาวน์โหลดภาพ #${r.id}`}
                          >
                            <Download />
                          </a>
                        )}
                        <button
                          className="iconbtn sm danger"
                          onClick={() => void remove([r.id])}
                          disabled={busy}
                          aria-label={`ลบภาพ #${r.id}`}
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
          {data ? `แสดง ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.count, data.page * data.pageSize)} จาก ${fmtNum(data.count)} ภาพ` : "กำลังโหลด…"}
        </span>
        <span className="grow" />
        <button className="btn sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
          ก่อนหน้า
        </button>
        <span className="mono">
          หน้า {page} / {pages}
        </span>
        <button className="btn sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>
          ถัดไป
        </button>
      </div>

      {detail && (
        <Modal title={`ภาพ #${detail.id}`} icon={<ImageIcon />} onClose={() => setDetail(null)} variant="drawer">
          {detail.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={detail.url}
              alt={detail.prompt.slice(0, 120)}
              style={{ width: "100%", borderRadius: 10, border: "1px solid var(--line-2)", marginBottom: 16 }}
            />
          ) : (
            <div className={`alert ${detail.status === "failed" ? "bad" : "warn"}`} style={{ marginTop: 0, marginBottom: 16 }}>
              <Alert />
              <span>{detail.status === "failed" ? detail.error || "สร้างภาพไม่สำเร็จ" : "ภาพนี้ยังสร้างไม่เสร็จ"}</span>
            </div>
          )}

          <div className="field-label">
            <Film /> พรอมป์เต็ม
          </div>
          <p style={{ fontSize: 13.5, color: "var(--paper-2)", whiteSpace: "pre-wrap" }}>{detail.prompt}</p>
          <button
            className="btn sm"
            style={{ marginTop: 10 }}
            onClick={async () => toast((await copyText(detail.prompt)) ? "คัดลอกพรอมป์แล้ว" : "คัดลอกไม่สำเร็จ", "ok")}
          >
            <Copy /> คัดลอกพรอมป์
          </button>

          <hr className="rule" />
          <div className="field-label">
            <ImageIcon /> ข้อมูลการสร้างภาพ
          </div>
          <dl className="kv">
            <dt>โมเดล</dt>
            <dd>
              {detail.model_label} <span className="mono">({detail.model_id})</span>
            </dd>
            <dt>สัดส่วน / ความละเอียด</dt>
            <dd className="mono">
              {detail.aspect} · {detail.resolution}
            </dd>
            <dt>เครดิตที่ใช้</dt>
            <dd className="num">{detail.cost}</dd>
            <dt>บัญชีที่ใช้</dt>
            <dd>{tokenName(detail.token_id)}</dd>
            <dt>รหัสงาน</dt>
            <dd className="mono" style={{ wordBreak: "break-all" }}>{detail.job_id}</dd>
            <dt>สร้างเมื่อ</dt>
            <dd>
              <Time ms={detail.created_at} />
            </dd>
            <dt>เสร็จเมื่อ</dt>
            <dd>{detail.completed_at ? <Time ms={detail.completed_at} /> : "—"}</dd>
            <dt>เวลาที่ใช้</dt>
            <dd className="num">{fmtDur(detail.duration_ms)}</dd>
          </dl>

          {detail.refs?.length > 0 && (
            <>
              <hr className="rule" />
              <div className="field-label">
                <Clip /> รูปอ้างอิงที่แนบ ({detail.refs.length})
              </div>
              <div className="thumbs">
                {detail.refs.map((f, i) => (
                  <a key={i} className="thumb" href={f.link} target="_blank" rel="noreferrer" title={f.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thumb-img" src={f.thumb || f.link} alt={f.name} loading="lazy" />
                    <div className="thumb-name">{f.name}</div>
                  </a>
                ))}
              </div>
            </>
          )}

          <hr className="rule" />
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {detail.url && (
              <>
                <a className="btn primary" href={downloadUrl(detail.url, `genimgs-${detail.id}`)} download>
                  <Download /> ดาวน์โหลด
                </a>
                <a className="btn" href={detail.url} target="_blank" rel="noreferrer">
                  <External /> เปิดต้นฉบับ
                </a>
                <button
                  className="btn"
                  onClick={async () => toast((await copyText(detail.url!)) ? "คัดลอกลิงก์แล้ว" : "คัดลอกไม่สำเร็จ", "ok")}
                >
                  <Copy /> คัดลอกลิงก์
                </button>
              </>
            )}
            <button className="btn danger" onClick={() => void remove([detail.id])} disabled={busy}>
              <Trash /> ลบภาพนี้
            </button>
          </div>
        </Modal>
      )}

      {lightbox !== null && gallery[lightbox] && (
        <Lightbox items={gallery} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}