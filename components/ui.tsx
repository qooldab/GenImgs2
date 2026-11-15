"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Check, Info, Undo, X } from "./icons";

/* ── data helpers ─────────────────────────────────────────── */

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(path, {
    ...rest,
    cache: "no-store",
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: unknown })?.error;
    throw new Error(typeof msg === "string" ? msg : `คำขอล้มเหลว (HTTP ${res.status})`);
  }
  return data as T;
}

export const downloadUrl = (url: string, name: string) =>
  `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;

const TZ = "Asia/Bangkok";
const dtf = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
const df = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: TZ });
const tf = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));
export const fmtDateTime = (ms: number) => dtf.format(ms);
export const fmtDay = (ms: number) => df.format(ms);
export const fmtTime = (ms: number) => tf.format(ms);

export function fmtDur(ms: number | null | undefined) {
  if (!ms || ms < 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} วิ`;
  return `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")} น.`;
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtUntil(ms: number) {
  const left = Math.max(0, ms - Date.now());
  const h = Math.floor(left / 3600e3);
  const m = Math.floor((left % 3600e3) / 60e3);
  return h > 0 ? `${h} ชม. ${m} น.` : `${m} น.`;
}

export function relTime(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60e3) return "เมื่อสักครู่";
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} นาทีที่แล้ว`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} ชม.ที่แล้ว`;
  return fmtDateTime(ms);
}

export function Time({ ms, mode = "full" }: { ms: number; mode?: "full" | "day" | "time" }) {
  const text = mode === "day" ? fmtDay(ms) : mode === "time" ? fmtTime(ms) : fmtDateTime(ms);
  return <time dateTime={new Date(ms).toISOString()} title={fmtDateTime(ms)}>{text}</time>;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand("copy");
    ta.remove();
    return done;
  }
}

/** อ่านค่าที่จำไว้ในเครื่อง (พรอมป์ค้าง, โมเดลล่าสุด, งานที่ยังไม่เสร็จ) */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/* ── toasts + confirm ─────────────────────────────────────── */

type Kind = "ok" | "bad" | "warn" | "info";
type Toast = { id: number; msg: string; kind: Kind; undo?: () => void };
type ConfirmOpts = { title: string; body?: ReactNode; okLabel?: string; danger?: boolean };

type UI = {
  toast: (msg: string, kind?: Kind, undo?: () => void) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
};

const Ctx = createContext<UI | null>(null);

export function useUI(): UI {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUI must be used inside <UIProvider>");
  return ctx;
}

const ICONS: Record<Kind, typeof Check> = { ok: Check, bad: Alert, warn: Alert, info: Info };

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (msg: string, kind: Kind = "info", undo?: () => void) => {
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-3), { id, msg, kind, undo }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), undo ? 9000 : 4600),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setAsk({ ...opts, resolve })),
    [],
  );

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div key={t.id} className={`toast ${t.kind}`}>
              <Icon />
              <span className="msg">{t.msg}</span>
              {t.undo && (
                <button
                  className="undo"
                  onClick={() => {
                    t.undo?.();
                    dismiss(t.id);
                  }}
                >
                  <Undo style={{ width: 12, height: 12, verticalAlign: -2 }} /> เลิกทำ
                </button>
              )}
              <button className="iconbtn sm" onClick={() => dismiss(t.id)} aria-label="ปิดการแจ้งเตือน">
                <X />
              </button>
            </div>
          );
        })}
      </div>
      {ask && (
        <Modal title={ask.title} onClose={() => close(false)} icon={<Alert />}>
          {ask.body && <p style={{ fontSize: 13.5, color: "var(--paper-2)" }}>{ask.body}</p>}
          <div className="modal-foot" style={{ padding: "18px 0 0" }}>
            <button className="btn ghost" onClick={() => close(false)}>
              ยกเลิก
            </button>
            <button className={ask.danger ? "btn danger" : "btn primary"} onClick={() => close(true)} autoFocus>
              {ask.okLabel || "ยืนยัน"}
            </button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

/* ── modal / drawer ───────────────────────────────────────── */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
  footer,
  icon,
  variant = "center",
  labelId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  variant?: "center" | "drawer" | "bare";
  labelId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const headingId = labelId || autoId;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") || node?.querySelector<HTMLElement>(FOCUSABLE);
    (first || node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={`scrim ${variant === "drawer" ? "right" : "center"}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={variant === "drawer" ? "drawer" : variant === "bare" ? "lightbox" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={variant === "bare" ? undefined : headingId}
        aria-label={variant === "bare" ? title : undefined}
        tabIndex={-1}
      >
        {variant === "bare" ? (
          children
        ) : (
          <>
            <div className="modal-head">
              {icon}
              <h3 id={headingId}>{title}</h3>
              <button className="iconbtn sm" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="ปิด">
                <X />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="block">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint && <p className="help">{hint}</p>}
    </div>
  );
}

/** แปลง error จาก API เป็น toast และดีดกลับหน้าเข้าสู่ระบบเมื่อ session หมดอายุ */
export function useErrorTrap(onAuthLost: () => void) {
  const { toast } = useUI();
  return useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด";
      if (/เข้าสู่ระบบผู้ดูแล/.test(msg)) {
        toast("session หมดอายุ กรุณาเข้าสู่ระบบใหม่", "warn");
        onAuthLost();
        return;
      }
      toast(msg, "bad");
    },
    [onAuthLost, toast],
  );
}