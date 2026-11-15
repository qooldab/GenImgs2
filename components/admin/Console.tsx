"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  Aperture,
  ArrowLeft,
  Chart,
  Check,
  Clip,
  Clock,
  Film,
  Gift,
  Grid,
  ImageIcon,
  Key,
  Logout,
  Refresh,
  Zap,
} from "@/components/icons";
import { api, fmtNum, fmtUntil, useErrorTrap, useUI } from "@/components/ui";
import { Results } from "./Results";
import { Tokens } from "./Tokens";
import type { AdminToken, DailyReport, Summary, TokenPayload } from "./types";

type Stats = {
  totals: {
    images: number;
    spent: number;
    images_today: number;
    spent_today: number;
    pending: number;
    failed: number;
    with_refs: number;
  };
  byModel: { model_label: string; count: number; spent: number }[];
  daily: { day: string; count: number; spent: number }[];
};

type Tab = "overview" | "tokens" | "results";

const HUES = ["var(--safe)", "var(--chem)", "var(--film)", "var(--info)", "var(--warn)", "var(--ok)"];
const dayKey = (ms: number) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);

export function Console() {
  const router = useRouter();
  const { toast } = useUI();
  const onAuthLost = useCallback(() => router.refresh(), [router]);
  const trap = useErrorTrap(onAuthLost);

  const [tab, setTab] = useState<Tab>("overview");
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((data: TokenPayload) => {
    setTokens(data.tokens);
    if (data.summary) setSummary(data.summary);
  }, []);

  const reloadTokens = useCallback(async () => {
    apply(await api<TokenPayload>("/api/admin/tokens"));
  }, [apply]);

  const reloadStats = useCallback(async () => {
    const data = await api<Stats & { summary: Summary }>("/api/admin/overview");
    setStats(data);
    setSummary(data.summary);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([reloadTokens(), reloadStats()]);
      } catch (err) {
        trap(err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [reloadStats, reloadTokens, trap]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      trap(err);
    } finally {
      setBusy(null);
    }
  };

  const refreshAll = () =>
    act("refresh", async () => {
      apply(await api<TokenPayload>("/api/admin/refresh", { method: "POST", json: {} }));
      await reloadStats();
      toast("เช็คเครดิตทุกบัญชีแล้ว", "ok");
    });

  const claimAll = () =>
    act("daily", async () => {
      const data = await api<TokenPayload & { report: DailyReport }>("/api/admin/daily", { method: "POST", json: {} });
      apply(data);
      await reloadStats();
      const r = data.report;
      if (r.claimed) toast(`รับเดลี ${r.claimed} บัญชี +${fmtNum(r.gained)} เครดิต`, "ok");
      else if (r.failed) toast(`รับเดลีไม่สำเร็จ ${r.failed} บัญชี — ${r.failures[0]?.message || ""}`, "warn");
      else toast("ทุกบัญชีรับเดลีรอบนี้ไปแล้ว", "info");
    });

  const logout = () =>
    act("logout", async () => {
      await api("/api/admin/login", { method: "DELETE" });
      toast("ออกจากระบบแล้ว", "ok");
      router.refresh();
    });

  const creditClass = !summary?.known ? "" : summary.total === 0 ? "out" : summary.total < 30 ? "low" : "";

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <div className="brand">
            <span className="mark">
              <Aperture />
            </span>
            <span className="brand-txt">
              <span className="brand-name">
                Gen<em>Imgs</em>
              </span>
              <span className="brand-sub">admin console</span>
            </span>
          </div>
          <span className="pill chem adminpill">
            <Key /> ผู้ดูแลระบบ
          </span>
          {summary && (
            <span className="chip resetchip" title="เครดิตและเดลีรีเซ็ตทุกวัน 11:00 น. เวลาไทย">
              <Clock /> รีเซ็ตใน {fmtUntil(summary.nextResetAt)}
            </span>
          )}
          <div className="meter" title="เครดิตจริงรวมทุกบัญชีที่เปิดใช้">
            <span className="meter-label">เครดิต</span>
            <span className={`meter-num ${creditClass}`}>{summary?.known ? fmtNum(summary.total) : "···"}</span>
            <button
              className={`iconbtn sm ${busy === "refresh" ? "busy" : ""}`}
              onClick={() => void refreshAll()}
              disabled={!!busy}
              aria-label="เช็คเครดิตทุกบัญชี"
              title="เช็คเครดิตทุกบัญชีใหม่"
            >
              <Refresh />
            </button>
          </div>
          <button className="btn" onClick={() => void claimAll()} disabled={!!busy}>
            {busy === "daily" ? <span className="spinner" /> : <Gift />} รับเดลีทั้งหมด
            {!!summary?.dailyPending && <span className="pill chem">{summary.dailyPending}</span>}
          </button>
          <Link className="textlink" href="/">
            <ArrowLeft /> หน้าสร้างภาพ
          </Link>
          <button className="iconbtn" onClick={() => void logout()} disabled={!!busy} aria-label="ออกจากระบบ" title="ออกจากระบบ">
            <Logout />
          </button>
        </div>
      </header>

      <main id="main" className="wrap">
        <div className="tabs" role="tablist" aria-label="ส่วนของหน้าผู้ดูแล">
          {(
            [
              ["overview", "ภาพรวม", <Chart key="i" />],
              ["tokens", "บัญชี & เครดิต", <Key key="i" />],
              ["results", "คลังภาพ", <Grid key="i" />],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className="tab"
              onClick={() => setTab(id)}
              id={`tab-${id}`}
              aria-controls={`panel-${id}`}
            >
              {icon} {label}
              {id === "tokens" && loaded && <span className="badge">{tokens.length}</span>}
              {id === "results" && stats && <span className="badge">{fmtNum(stats.totals.images)}</span>}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" style={{ paddingTop: 18 }}>
            <Overview stats={stats} summary={summary} tokens={tokens} />
          </div>
        )}
        {tab === "tokens" && (
          <div id="panel-tokens" role="tabpanel" aria-labelledby="tab-tokens">
            <Tokens tokens={tokens} summary={summary} apply={apply} reload={reloadTokens} onAuthLost={onAuthLost} />
          </div>
        )}
        {tab === "results" && (
          <div id="panel-results" role="tabpanel" aria-labelledby="tab-results">
            <Results tokens={tokens} onChanged={() => void reloadStats().catch(trap)} onAuthLost={onAuthLost} />
          </div>
        )}

        <footer className="foot">
          <span>GenImgs admin · จัดการบัญชี เครดิต และคลังภาพ</span>
          <i className="sep" />
          <span>token อยู่ฝั่งเซิร์ฟเวอร์ทั้งหมด</span>
          <i className="sep" />
          <span>ข้อมูลภาพเก่าก่อนย้ายระบบไม่ถูกนำเข้า</span>
        </footer>
      </main>
    </>
  );
}

function Overview({
  stats,
  summary,
  tokens,
}: {
  stats: Stats | null;
  summary: Summary | null;
  tokens: AdminToken[];
}) {
  if (!stats) {
    return (
      <div className="panel">
        <div className="empty">
          <span className="spinner" style={{ margin: "0 auto 12px" }} />
          กำลังโหลดภาพรวม…
        </div>
      </div>
    );
  }

  const t = stats.totals;
  const days = Array.from({ length: 14 }, (_, i) => {
    const ms = Date.now() - (13 - i) * 86400e3;
    const key = dayKey(ms);
    const hit = stats.daily.find((d) => d.day === key);
    return { key, count: hit?.count ?? 0, spent: hit?.spent ?? 0, today: i === 13 };
  });
  const peak = Math.max(1, ...days.map((d) => d.count));
  const modelTotal = Math.max(1, ...stats.byModel.map((m) => m.count));
  const unhealthy = tokens.filter((x) => x.enabled && (x.status === "invalid" || x.status === "expired" || x.status === "error"));

  const cards: { k: string; v: string; sub: string; wash: string; icon: React.ReactNode }[] = [
    {
      k: "เครดิตรวมพร้อมใช้",
      v: summary?.known ? fmtNum(summary.total) : "···",
      sub: "รีเซ็ตทุกวัน 11:00 น. เวลาไทย",
      wash: "rgba(255,122,47,.18)",
      icon: <Zap />,
    },
    {
      k: "ภาพที่สร้างเสร็จ",
      v: fmtNum(t.images),
      sub: `ใช้เครดิตสะสม ${fmtNum(t.spent)}`,
      wash: "rgba(47,216,192,.16)",
      icon: <ImageIcon />,
    },
    {
      k: "วันนี้",
      v: fmtNum(t.images_today),
      sub: `ใช้ไป ${fmtNum(t.spent_today)} เครดิต`,
      wash: "rgba(255,61,127,.16)",
      icon: <Film />,
    },
    {
      k: "ค้าง / ล้มเหลว",
      v: `${fmtNum(t.pending)} / ${fmtNum(t.failed)}`,
      sub: "งานที่ยังสร้างไม่เสร็จ และงานที่พลาด",
      wash: "rgba(255,194,75,.16)",
      icon: <Clock />,
    },
    {
      k: "ภาพที่แนบอ้างอิง",
      v: fmtNum(t.with_refs),
      sub: "สัดส่วนงานที่มีรูปต้นแบบ",
      wash: "rgba(111,168,255,.16)",
      icon: <Clip />,
    },
    {
      k: "บัญชีทั้งหมด",
      v: fmtNum(summary?.tokenCount ?? tokens.length),
      sub: `เดลีที่ยังไม่รับ ${summary?.dailyPending ?? 0} บัญชี`,
      wash: "rgba(102,217,139,.16)",
      icon: <Key />,
    },
  ];

  return (
    <>
      <div className="stats">
        {cards.map((c) => (
          <div className="stat" key={c.k} style={{ "--wash": c.wash } as CSSProperties}>
            <div className="stat-k">
              {c.icon}
              {c.k}
            </div>
            <div className="stat-v">{c.v}</div>
            <div className="stat-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {unhealthy.length > 0 && (
        <div className="alert warn" style={{ marginTop: 16 }}>
          <Key />
          <span>
            มี {unhealthy.length} บัญชีที่ใช้งานไม่ได้ ({unhealthy.map((x) => x.account_email || `#${x.id}`).join(", ")}) — เปิดแท็บ “บัญชี &
            เครดิต” เพื่อเปลี่ยน token หรือปิดใช้
          </span>
        </div>
      )}

      <div className="grid-2">
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <span className="panel-idx">14 วันล่าสุด</span>
            <h2 className="panel-title">จำนวนภาพที่สร้างต่อวัน</h2>
          </div>
          <div className="panel-body">
            <div className="chart">
              {days.map((d) => (
                <div
                  className={`chart-col ${d.today ? "today" : ""}`}
                  key={d.key}
                  title={`${d.key} · ${d.count} ภาพ · ${d.spent} เครดิต`}
                >
                  <span className="chart-v">{d.count || ""}</span>
                  <div className="chart-bar" style={{ height: `${Math.max(3, (d.count / peak) * 110)}px` }} />
                  <span className="chart-x">{d.key.slice(8)}</span>
                </div>
              ))}
            </div>
            <p className="help">แท่งสีเขียวน้ำทะเลคือวันนี้ · ตัวเลขบนแท่งคือจำนวนภาพที่สร้างเสร็จ</p>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <span className="panel-idx">แยกตามโมเดล</span>
            <h2 className="panel-title">สัดส่วนการใช้งาน</h2>
          </div>
          <div className="panel-body">
            {stats.byModel.length === 0 ? (
              <div className="empty">
                <Film />
                ยังไม่มีภาพในระบบ
              </div>
            ) : (
              <div className="bars">
                {stats.byModel.map((m, i) => (
                  <div className="bar-row" key={m.model_label}>
                    <span className="bar-name">
                      <i className="bar-swatch" style={{ background: HUES[i % HUES.length] }} />
                      {m.model_label}
                    </span>
                    <span className="bar-val">
                      {fmtNum(m.count)} ภาพ · {fmtNum(m.spent)} cr
                    </span>
                    <span className="bar-track">
                      <i
                        className="bar-fill"
                        style={{ width: `${(m.count / modelTotal) * 100}%`, background: HUES[i % HUES.length] }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="help">
              <Check style={{ width: 12, height: 12, verticalAlign: -2 }} /> นับเฉพาะภาพที่สร้างเสร็จและยังไม่ถูกลบ
            </p>
          </div>
        </section>
      </div>
    </>
  );
}