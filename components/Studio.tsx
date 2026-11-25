"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASPECTS,
  MODELS,
  REF_ACCEPT,
  RESOLUTION,
  getModel,
  type Credits,
  type GalleryItem,
} from "@/lib/models";
import { isImageFile, prepareImage } from "@/lib/image-client";
import {
  Alert,
  Aperture,
  Check,
  Clip,
  Clock,
  Copy,
  Download,
  External,
  Film,
  Grid,
  ImageIcon,
  Info,
  Lock,
  Pencil,
  Refresh,
  Search,
  Trash,
  Upload,
  X,
  Zap,
} from "./icons";
import { Lightbox } from "./Lightbox";
import {
  api,
  copyText,
  downloadUrl,
  fmtClock,
  fmtDur,
  fmtNum,
  fmtUntil,
  readLocal,
  Time,
  useUI,
  writeLocal,
} from "./ui";

type Ref = {
  key: string;
  name: string;
  preview: string;
  link?: string;
  thumb?: string;
  tokenId?: number;
  state: "uploading" | "ready" | "error";
  error?: string;
};

type Job = {
  key: string;
  jobId: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  aspect: string;
  cost: number;
  startedAt: number;
  refCount: number;
  status: "sending" | "running" | "failed";
  error?: string;
};

type LocalItem = GalleryItem & { jobId: string };

const JOB_KEY = "genimgs.jobs.v1";
const HISTORY_KEY = "genimgs.history.v1";
const DRAFT_KEY = "genimgs.draft";
const PREF_KEY = "genimgs.prefs";
const JOB_TTL = 15 * 60_000;
const MAX_JOBS = 5;
const HISTORY_MAX = 200;

const ASPECT_BOX: Record<string, [number, number]> = {
  "1:1": [22, 22],
  "4:3": [26, 19.5],
  "3:4": [19.5, 26],
  "16:9": [28, 15.75],
  "9:16": [15.75, 28],
};

const IDEAS = [
  {
    label: "ภาพสินค้า",
    icon: ImageIcon,
    prompt:
      "ขวดน้ำหอมแก้วเจียระไนวางบนหินอ่อนเปียก แสงข้างสีส้มอุ่น เงาสะท้อนคมชัด ภาพถ่ายสินค้าในสตูดิโอ พื้นหลังไล่โทนน้ำตาลเข้ม ไม่มีตัวหนังสือ",
  },
  {
    label: "ตัวละคร",
    icon: Film,
    prompt:
      "นักรบหญิงชุดเกราะหนังสีน้ำตาล ผมสั้นสีดำ ยืนกลางทะเลทรายยามเช้า แสงย้อนขอบสีทอง คอนเซปต์อาร์ตเกม รายละเอียดสูง ไม่มีตัวหนังสือ",
  },
  {
    label: "บรรยากาศเมือง",
    icon: Aperture,
    prompt:
      "ตรอกเมืองเก่าตอนกลางคืนฝนตก ป้ายไฟนีออนสีส้มกับชมพูสะท้อนแอ่งน้ำ มุมกล้องระดับสายตา โทนฟิล์ม 35mm เกรนละเอียด ไม่มีตัวหนังสือ",
  },
];

const isLocalItem = (x: unknown): x is LocalItem => {
  const v = x as LocalItem;
  return !!v && typeof v.url === "string" && typeof v.prompt === "string" && typeof v.jobId === "string";
};

function ResetChip({ nextResetAt }: { nextResetAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="chip resetchip"
      title="เครดิตของทุกบัญชีรีเซ็ตทุกวันเวลา 11:00 น. ตามเวลาไทย"
      suppressHydrationWarning
    >
      <Clock /> รีเซ็ตใน {fmtUntil(nextResetAt)}
    </span>
  );
}

export function Studio({ initialCredits, initialError }: { initialCredits: Credits | null; initialError?: string }) {
  const { toast, confirm } = useUI();

  const [credits, setCredits] = useState<Credits | null>(initialCredits);
  const [creditErr, setCreditErr] = useState<string | null>(initialError || null);
  const [refreshing, setRefreshing] = useState(false);

  const [modelId, setModelId] = useState(MODELS[0].id as string);
  const [aspect, setAspect] = useState<string>("16:9");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<Ref[]>([]);
  const [dragging, setDragging] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [results, setResults] = useState<LocalItem[]>([]);
  const [current, setCurrent] = useState<LocalItem | null>(null);

  const [query, setQuery] = useState("");
  const [galleryModel, setGalleryModel] = useState("all");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [refBusy, setRefBusy] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const rawFiles = useRef(new Map<string, File>());
  const previews = useRef(new Set<string>());
  const pinToken = useRef<number | null>(null);
  const jobsRef = useRef<Job[]>([]);
  const hydrated = useRef(false);
  const retried = useRef(false);
  const spec = getModel(modelId) || MODELS[0];

  /* ── restore prefs / draft / own history / unfinished jobs ── */
  useEffect(() => {
    const prefs = readLocal(PREF_KEY, { modelId: MODELS[0].id as string, aspect: "16:9" });
    if (getModel(prefs.modelId)) setModelId(prefs.modelId);
    if (ASPECTS.includes(prefs.aspect as (typeof ASPECTS)[number])) setAspect(prefs.aspect);
    setPrompt(readLocal(DRAFT_KEY, ""));

    const history = readLocal<unknown[]>(HISTORY_KEY, []).filter(isLocalItem);
    setResults(history);
    if (history.length) {
      void api("/api/results/sync", {
        method: "POST",
        json: {
          items: history.slice(0, 30).map((r) => ({
            jobId: r.jobId,
            url: r.url,
            prompt: r.prompt,
            modelId: r.modelId,
            aspect: r.aspect,
            cost: r.cost,
            createdAt: r.createdAt,
          })),
        },
      }).catch(() => {});
    }

    const saved = readLocal<Job[]>(JOB_KEY, []).filter(
      (j) => j?.jobId && j.status === "running" && Date.now() - j.startedAt < JOB_TTL,
    );
    if (saved.length) setJobs(saved);
  }, []);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => writeLocal(PREF_KEY, { modelId, aspect }), [modelId, aspect]);

  useEffect(() => {
    const id = setTimeout(() => writeLocal(DRAFT_KEY, prompt), 400);
    return () => clearTimeout(id);
  }, [prompt]);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    writeLocal(HISTORY_KEY, results.slice(0, HISTORY_MAX));
  }, [results]);

  useEffect(() => writeLocal(JOB_KEY, jobs.filter((j) => j.status === "running" && j.jobId)), [jobs]);

  useEffect(() => {
    const set = previews.current;
    return () => set.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  /* ── credits ────────────────────────────────────────────── */
  const loadCredits = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const data = await api<Credits & { refreshing?: boolean }>(`/api/credits${force ? "?refresh=1" : ""}`);
      setCredits(data);
      setCreditErr(null);
      if (data.refreshing && !retried.current) {
        retried.current = true;
        setTimeout(() => void loadCredits(), 4000);
      }
    } catch (err) {
      setCreditErr(err instanceof Error ? err.message : "โหลดเครดิตไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  /* ── attachments ────────────────────────────────────────── */
  const uploadOne = useCallback(
    async (key: string, file: File) => {
      try {
        const prepared = await prepareImage(file);
        const form = new FormData();
        form.append("file", prepared, prepared.name);
        if (pinToken.current) form.append("tokenId", String(pinToken.current));
        const data = await api<{ link: string; thumb?: string; name: string; tokenId: number }>("/api/upload", {
          method: "POST",
          body: form,
        });
        pinToken.current = data.tokenId;
        setRefs((list) =>
          list.map((r) =>
            r.key === key
              ? { ...r, state: "ready", link: data.link, thumb: data.thumb, tokenId: data.tokenId, error: undefined }
              : r,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ";
        setRefs((list) => list.map((r) => (r.key === key ? { ...r, state: "error", error: msg } : r)));
        toast(msg, "bad");
      }
    },
    [toast],
  );

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const images = incoming.filter(isImageFile);
      if (!images.length) {
        toast("ไฟล์ที่เลือกไม่ใช่รูปภาพ", "warn");
        return;
      }
      const room = spec.maxFiles - refs.length;
      if (room <= 0) {
        toast(`${spec.label} แนบรูปได้สูงสุด ${spec.maxFiles} รูป`, "warn");
        return;
      }
      const take = images.slice(0, room);
      if (images.length > room) toast(`แนบได้อีก ${room} รูปสำหรับ ${spec.label} — ที่เหลือถูกข้าม`, "warn");

      const entries: Ref[] = take.map((file, i) => {
        const key = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        rawFiles.current.set(key, file);
        return { key, name: file.name || "reference.jpg", preview, state: "uploading" };
      });
      setRefs((list) => [...list, ...entries]);
      for (const entry of entries) await uploadOne(entry.key, rawFiles.current.get(entry.key)!);
    },
    [refs.length, spec.label, spec.maxFiles, toast, uploadOne],
  );

  const dropRef = useCallback(
    (key: string) => {
      const target = refs.find((r) => r.key === key);
      if (target) {
        URL.revokeObjectURL(target.preview);
        previews.current.delete(target.preview);
      }
      rawFiles.current.delete(key);
      setRefs((list) => {
        const next = list.filter((r) => r.key !== key);
        if (!next.some((r) => r.tokenId)) pinToken.current = null;
        return next;
      });
    },
    [refs],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files || [])].filter(isImageFile);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const useAsReference = useCallback(
    async (item: GalleryItem) => {
      if (refs.length >= spec.maxFiles) {
        toast(`${spec.label} แนบรูปได้สูงสุด ${spec.maxFiles} รูป`, "warn");
        return;
      }
      setRefBusy(true);
      try {
        const res = await fetch(downloadUrl(item.url, `genimgs-${item.id}`));
        if (!res.ok) throw new Error("ดึงรูปมาใช้อ้างอิงไม่สำเร็จ");
        const blob = await res.blob();
        await addFiles([new File([blob], `genimgs-${item.id}.png`, { type: blob.type || "image/png" })]);
        toast("เพิ่มภาพลงรูปอ้างอิงแล้ว", "ok");
      } catch (err) {
        toast(err instanceof Error ? err.message : "เพิ่มรูปอ้างอิงไม่สำเร็จ", "bad");
      } finally {
        setRefBusy(false);
      }
    },
    [addFiles, refs.length, spec.label, spec.maxFiles, toast],
  );

  /* ── jobs ───────────────────────────────────────────────── */
  const running = useMemo(() => jobs.filter((j) => j.status !== "failed"), [jobs]);
  const focus = running.length ? running[running.length - 1] : null;
  const uploading = refs.some((r) => r.state === "uploading");
  const brokenRefs = refs.some((r) => r.state === "error");
  const overCount = Math.max(0, refs.length - spec.maxFiles);
  const shortCredits = !!credits?.known && credits.total < spec.cost;
  const canAdd = running.length < MAX_JOBS;
  const canGo = !!prompt.trim() && !uploading && !brokenRefs && !shortCredits && overCount === 0 && canAdd;

  const trimRefs = useCallback(() => {
    setRefs((list) => {
      const keep = list.slice(0, spec.maxFiles);
      list.slice(spec.maxFiles).forEach((r) => {
        URL.revokeObjectURL(r.preview);
        previews.current.delete(r.preview);
        rawFiles.current.delete(r.key);
      });
      if (!keep.some((r) => r.tokenId)) pinToken.current = null;
      return keep;
    });
  }, [spec.maxFiles]);

  const finishJob = useCallback(
    (job: Job, item: GalleryItem) => {
      const local: LocalItem = { ...item, jobId: job.jobId };
      setResults((list) => [local, ...list.filter((r) => r.jobId !== job.jobId)]);
      setCurrent(local);
      setJobs((list) => list.filter((j) => j.jobId !== job.jobId));
      toast(`สร้างเสร็จใน ${fmtDur(Date.now() - job.startedAt)}`, "ok");
      void loadCredits();
    },
    [loadCredits, toast],
  );

  const run = useCallback(
    (text: string, mId: string, asp: string) => {
      if (jobsRef.current.filter((j) => j.status !== "failed").length >= MAX_JOBS) {
        toast(`สร้างพร้อมกันได้สูงสุด ${MAX_JOBS} งาน — รอให้งานหนึ่งเสร็จก่อน`, "warn");
        return;
      }
      const model = getModel(mId) || MODELS[0];
      const ready = refs.filter((r) => r.state === "ready" && r.link).slice(0, model.maxFiles);
      const key = `j${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const job: Job = {
        key,
        jobId: "",
        prompt: text,
        modelId: model.id,
        modelLabel: model.label,
        aspect: asp,
        cost: model.cost,
        startedAt: Date.now(),
        refCount: ready.length,
        status: "sending",
      };
      setJobs((list) => [...list, job]);

      api<{ jobId: string }>("/api/generate", {
        method: "POST",
        json: {
          prompt: text,
          modelId: model.id,
          aspect: asp,
          refs: ready.map((r) => ({ link: r.link, name: r.name, thumb: r.thumb, tokenId: r.tokenId })),
        },
      })
        .then((data) =>
          setJobs((list) =>
            list.map((j) =>
              j.key === key ? { ...j, jobId: data.jobId, status: "running", startedAt: Date.now() } : j,
            ),
          ),
        )
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "ส่งคำสั่งสร้างภาพไม่สำเร็จ";
          setJobs((list) => list.map((j) => (j.key === key ? { ...j, status: "failed", error: msg } : j)));
          toast(msg, "bad");
          void loadCredits();
        });
    },
    [loadCredits, refs, toast],
  );

  const submit = useCallback(() => {
    const text = prompt.trim();
    if (!text || !canGo) return;
    run(text, spec.id, aspect);
  }, [aspect, canGo, prompt, run, spec.id]);

  const retryJob = useCallback(
    (job: Job) => {
      setJobs((list) => list.filter((j) => j.key !== job.key));
      run(job.prompt, job.modelId, job.aspect);
    },
    [run],
  );

  const dismissJob = (key: string) => setJobs((list) => list.filter((j) => j.key !== key));

  useEffect(() => {
    if (!running.length) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running.length]);

  const hasRunning = jobs.some((j) => j.status === "running" && j.jobId);
  useEffect(() => {
    if (!hasRunning) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2500;

    const tick = async () => {
      const active = jobsRef.current.filter((j) => j.status === "running" && j.jobId);
      const responses = await Promise.all(
        active.map(async (job) => {
          try {
            return {
              job,
              data: await api<{ status: string; error?: string; result?: GalleryItem }>(
                `/api/jobs/${encodeURIComponent(job.jobId)}`,
              ),
            };
          } catch (err) {
            return { job, error: err instanceof Error ? err.message : "ติดต่อเซิร์ฟเวอร์ไม่ได้" };
          }
        }),
      );
      if (stopped) return;
      for (const r of responses) {
        if (r.data?.status === "completed" && r.data.result) {
          finishJob(r.job, r.data.result);
        } else if (r.data?.status === "failed") {
          const msg = r.data.error || "โมเดลสร้างภาพไม่สำเร็จ";
          setJobs((list) =>
            list.map((j) => (j.jobId === r.job.jobId ? { ...j, status: "failed", error: msg } : j)),
          );
          void loadCredits();
        }
      }
      delay = Math.min(delay + 500, 5000);
      if (!stopped) timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 1200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [finishJob, hasRunning, loadCredits]);

  /* ── gallery (local history only) ───────────────────────── */
  const gallery = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter(
      (r) =>
        (galleryModel === "all" || r.modelId === galleryModel) &&
        (!q || r.prompt.toLowerCase().includes(q) || r.modelLabel.toLowerCase().includes(q)),
    );
  }, [galleryModel, query, results]);

  const modelOptions = useMemo(() => {
    const seen = new Map<string, string>();
    results.forEach((r) => seen.set(r.modelId, r.modelLabel));
    return [...seen.entries()];
  }, [results]);

  const openLightbox = (item: GalleryItem) => {
    const i = gallery.findIndex((r) => r.id === item.id);
    setLightbox(i >= 0 ? i : null);
  };

  const clearHistory = async () => {
    const ok = await confirm({
      title: "ล้างประวัติในเครื่องนี้?",
      body: "รูปและลิงก์ที่เก็บในเบราว์เซอร์นี้จะหายไป (ยังอยู่ในฐานข้อมูลกลางและหน้าแอดมิน)",
      okLabel: "ล้างประวัติ",
      danger: true,
    });
    if (!ok) return;
    setResults([]);
    setCurrent(null);
    writeLocal(HISTORY_KEY, []);
    toast("ล้างประวัติในเครื่องแล้ว", "ok");
  };

  const creditClass = !credits?.known ? "" : credits.total === 0 ? "out" : credits.total < 30 ? "low" : "";
  const activeItem = focus ? null : current;

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
              <span className="brand-sub">image studio</span>
            </span>
          </div>

          {credits && <ResetChip nextResetAt={credits.nextResetAt} />}
          <div className="meter" title="เครดิตจริงรวมทุกบัญชีที่ใช้ได้ — กดเช็คเพื่อดึงยอดล่าสุด">
            <span className="meter-label">เครดิต</span>
            <span className={`meter-num ${creditClass}`}>{credits?.known ? fmtNum(credits.total) : "···"}</span>
            <button
              className={`iconbtn sm ${refreshing ? "busy" : ""}`}
              onClick={() => void loadCredits(true)}
              disabled={refreshing}
              aria-label="เช็คเครดิตใหม่"
              title="เช็คเครดิตใหม่จากเซิร์ฟเวอร์"
            >
              <Refresh />
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="wrap">
        {creditErr && (
          <div className="alert bad" style={{ marginTop: 16 }}>
            <Alert />
            <span>
              {creditErr}{" "}
              <button className="btn sm ghost" onClick={() => void loadCredits(true)} style={{ marginLeft: 6 }}>
                <Refresh /> ลองใหม่
              </button>
            </span>
          </div>
        )}

        <div className="workspace">
          {/* ── setup ── */}
          <section className="panel setup" aria-labelledby="setup-title">
            <div className="panel-head">
              <span className="panel-idx">01</span>
              <h2 className="panel-title" id="setup-title">
                สร้างภาพ
              </h2>
              {running.length > 0 && (
                <span className="pill chem" style={{ marginLeft: "auto" }}>
                  กำลังสร้าง {running.length}/{MAX_JOBS}
                </span>
              )}
            </div>
            <div className="panel-body">
              <div className="block">
                <div className="field-label">
                  <span className="n">1</span> เลือกโมเดล
                  <span className="hint">{spec.cost} เครดิต/ภาพ</span>
                </div>
                <div className="models" role="radiogroup" aria-label="เลือกโมเดลสร้างภาพ">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={modelId === m.id}
                      className="model"
                      onClick={() => setModelId(m.id)}
                    >
                      <span className="model-radio" aria-hidden="true" />
                      <span>
                        <span className="model-name">
                          {m.label} <span className="model-vendor">{m.vendor}</span>
                        </span>
                        <span className="model-blurb">{m.blurb}</span>
                      </span>
                      <span className="model-cost">{m.cost} cr</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="block">
                <div className="field-label">
                  <span className="n">2</span> สัดส่วนภาพ
                </div>
                <div className="ratio-row">
                  <div className="aspects" role="radiogroup" aria-label="เลือกสัดส่วนภาพ">
                    {ASPECTS.map((a) => {
                      const [w, h] = ASPECT_BOX[a];
                      return (
                        <button
                          key={a}
                          type="button"
                          role="radio"
                          aria-checked={aspect === a}
                          className="aspect"
                          onClick={() => setAspect(a)}
                          title={`สัดส่วน ${a}`}
                        >
                          <span className="aspect-box">
                            <i style={{ width: w, height: h }} />
                          </span>
                          <span>{a}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="block">
                <div className="field-label">
                  <span className="n">3</span> พรอมป์
                  <span className="hint">พิมพ์ไทยหรืออังกฤษก็ได้</span>
                </div>
                <div className="prompt-wrap">
                  <textarea
                    id="prompt"
                    ref={promptBox}
                    className="prompt"
                    value={prompt}
                    maxLength={6000}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canGo) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="เช่น หญิงสาวในเสื้อกันฝนสีเหลืองยืนกลางตลาดกลางคืนฝนตก แสงนีออนสีส้มสะท้อนพื้นเปียก ภาพถ่ายฟิล์ม 35mm เกรนละเอียด"
                    aria-label="พรอมป์บรรยายภาพที่ต้องการ"
                  />
                </div>
                <div className="prompt-foot">
                  <span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> เพื่อสร้างภาพ
                  <span className="count">{fmtNum(prompt.length)} / 6,000</span>
                </div>
              </div>

              <div className="block">
                <div className="field-label">
                  <span className="n">4</span> รูปอ้างอิง
                  <span className="hint">
                    ไม่บังคับ · {refs.length}/{spec.maxFiles}
                  </span>
                </div>
                <button
                  type="button"
                  className={`drop ${dragging ? "over" : ""}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void addFiles([...e.dataTransfer.files]);
                  }}
                  disabled={refs.length >= spec.maxFiles}
                >
                  <Upload />
                  <span className="drop-txt">
                    ลากรูปมาวาง คลิกเพื่อเลือก หรือวางจากคลิปบอร์ด
                    <small>JPG · PNG · WEBP · HEIC — ย่อให้เองก่อนอัปโหลด (ไม่เกิน 3.5 MB/รูป)</small>
                  </span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={REF_ACCEPT}
                  multiple
                  className="sr"
                  onChange={(e) => {
                    void addFiles([...(e.target.files || [])]);
                    e.target.value = "";
                  }}
                  aria-label="เลือกไฟล์รูปอ้างอิง"
                />
                {refs.length > 0 && (
                  <div className="thumbs">
                    {refs.map((r) => (
                      <div key={r.key} className={`thumb ${r.state === "uploading" ? "pending" : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="thumb-img" src={r.thumb || r.preview} alt={r.name} />
                        {r.state === "uploading" && (
                          <span className="thumb-badge">
                            <span className="spinner" />
                          </span>
                        )}
                        {r.state === "error" && (
                          <span className="thumb-badge">
                            <button
                              className="iconbtn sm"
                              title={r.error || "อัปโหลดไม่สำเร็จ"}
                              aria-label={`ลองอัปโหลด ${r.name} อีกครั้ง`}
                              onClick={() => {
                                const file = rawFiles.current.get(r.key);
                                if (!file) return;
                                setRefs((list) => list.map((x) => (x.key === r.key ? { ...x, state: "uploading" } : x)));
                                void uploadOne(r.key, file);
                              }}
                            >
                              <Refresh />
                            </button>
                          </span>
                        )}
                        <button className="thumb-x" onClick={() => dropRef(r.key)} aria-label={`ลบ ${r.name}`}>
                          <X />
                        </button>
                        <div className="thumb-name" title={r.error || r.name}>
                          {r.state === "error" ? "อัปโหลดไม่สำเร็จ" : r.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="panel-foot">
              <button className="go" onClick={submit} disabled={!canGo}>
                <Zap />
                สร้างภาพ
                <span className="cost">−{spec.cost} เครดิต</span>
              </button>

              {!canAdd ? (
                <p className="go-note warn">
                  <Alert /> มีงานกำลังสร้าง {running.length} งาน (สูงสุด {MAX_JOBS}) — รอให้เสร็จก่อนจึงเริ่มใหม่ได้
                </p>
              ) : shortCredits ? (
                <p className="go-note warn">
                  <Alert /> เครดิตรวมไม่พอสำหรับ {spec.label} ({spec.cost} เครดิต) — เครดิตรีเซ็ตทุกวัน 11:00 น.
                  หรือเลือกโมเดลที่ถูกลง
                </p>
              ) : overCount > 0 ? (
                <p className="go-note warn">
                  <Alert /> {spec.label} แนบรูปได้สูงสุด {spec.maxFiles} รูป — ตอนนี้มี {refs.length} รูป
                  <button className="btn sm" style={{ marginLeft: 8 }} onClick={trimRefs}>
                    เก็บไว้ {spec.maxFiles} รูปแรก
                  </button>
                </p>
              ) : brokenRefs ? (
                <p className="go-note warn">
                  <Alert /> มีรูปอ้างอิงที่อัปโหลดไม่สำเร็จ กดลองใหม่หรือลบออกก่อนสร้างภาพ
                </p>
              ) : uploading ? (
                <p className="go-note">
                  <Info /> รออัปโหลดรูปอ้างอิงให้เสร็จก่อน
                </p>
              ) : (
                <p className="go-note">
                  <Info /> กดสร้างซ้ำได้เลยระหว่างรอ — สร้างพร้อมกันได้ถึง {MAX_JOBS} งาน · {RESOLUTION} · ราว 15–90
                  วินาที/งาน
                </p>
              )}
            </div>
          </section>

          {/* ── results ── */}
          <section className="panel lighttable" aria-labelledby="table-title">
            <div className="panel-head">
              <span className="panel-idx">02</span>
              <h2 className="panel-title" id="table-title">
                ผลลัพธ์
              </h2>
              <span className="spacer" />
              {running.length > 0 && <span className="tag warn">กำลังสร้าง {running.length}</span>}
              {!running.length && activeItem && <span className="tag ok">พร้อมใช้งาน</span>}
            </div>

            <div className="frame">
              {focus ? (
                <div className="developing">
                  <div className="developing-txt">
                    <div className="big">{focus.modelLabel} กำลังสร้างภาพ</div>
                    <div className="small">
                      {focus.aspect} · {RESOLUTION}
                      {focus.refCount ? ` · อ้างอิง ${focus.refCount} รูป` : ""}
                      {running.length > 1 ? ` · พร้อมกัน ${running.length} งาน` : ""}
                    </div>
                    <div className="timer">{fmtClock(now - focus.startedAt)}</div>
                    <span className="spinner" />
                  </div>
                </div>
              ) : activeItem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeItem.url} alt={activeItem.prompt.slice(0, 160)} />
              ) : (
                <div className="frame-empty">
                  <ImageIcon />
                  <h3>ยังไม่มีภาพในรอบนี้</h3>
                  <p>
                    เขียนพรอมป์ทางซ้ายแล้วกด “สร้างภาพ” — ภาพที่สร้างจะแสดงที่นี่และเก็บประวัติไว้ในเครื่องนี้
                    {results.length > 0 ? " (ภาพเก่าอยู่ใน “ภาพทั้งหมด” ด้านล่าง)" : ""}
                  </p>
                  <div className="ideas">
                    {IDEAS.map((idea) => (
                      <button
                        key={idea.label}
                        className="idea"
                        onClick={() => {
                          setPrompt(idea.prompt);
                          promptBox.current?.focus();
                          toast(`ใส่พรอมป์ “${idea.label}” ให้แล้ว แก้ต่อได้เลย`, "info");
                        }}
                      >
                        <idea.icon /> {idea.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {jobs.length > 0 && (
              <div className="joblist">
                {jobs.map((j) => (
                  <div key={j.key} className={`jobrow ${j.status === "failed" ? "failed" : ""}`}>
                    {j.status === "failed" ? (
                      <Alert style={{ color: "var(--bad)" }} />
                    ) : j.status === "sending" ? (
                      <span className="spinner" />
                    ) : (
                      <span className="spinner" />
                    )}
                    <span className="jp" title={j.prompt}>
                      {j.prompt}
                    </span>
                    <span className="jm">
                      {j.modelLabel} · {j.aspect}
                    </span>
                    {j.status === "failed" ? (
                      <>
                        <span className="err" title={j.error}>
                          {j.error?.slice(0, 40)}
                        </span>
                        <button className="iconbtn sm" onClick={() => retryJob(j)} aria-label="ลองสร้างงานนี้ใหม่">
                          <Refresh />
                        </button>
                        <button className="iconbtn sm" onClick={() => dismissJob(j.key)} aria-label="ปิดงานที่ล้มเหลว">
                          <X />
                        </button>
                      </>
                    ) : (
                      <span className="t">{fmtClock(now - j.startedAt)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeItem && (
              <>
                <div className="result-bar">
                  <a className="btn primary" href={downloadUrl(activeItem.url, `genimgs-${activeItem.id}`)} download>
                    <Download /> ดาวน์โหลด
                  </a>
                  <button className="btn" onClick={() => openLightbox(activeItem)} disabled={!gallery.some((r) => r.id === activeItem.id)}>
                    <Search /> ขยายดู
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setPrompt(activeItem.prompt);
                      promptBox.current?.focus();
                      toast("ดึงพรอมป์กลับมาแก้ไขแล้ว", "ok");
                    }}
                  >
                    <Pencil /> แก้พรอมป์นี้
                  </button>
                  <button className="btn" onClick={() => void useAsReference(activeItem)} disabled={refBusy}>
                    <Clip /> ใช้อ้างอิง
                  </button>
                  <button
                    className="btn"
                    onClick={async () => toast((await copyText(activeItem.url)) ? "คัดลอกลิงก์รูปแล้ว" : "คัดลอกไม่สำเร็จ", "ok")}
                  >
                    <Copy /> คัดลอกลิงก์
                  </button>
                  <a className="btn ghost" href={activeItem.url} target="_blank" rel="noreferrer">
                    <External /> ต้นฉบับ
                  </a>
                </div>
                <div className="result-meta">
                  <span>
                    <b>{activeItem.modelLabel}</b>
                  </span>
                  <span>
                    สัดส่วน <b>{activeItem.aspect}</b>
                  </span>
                  <span>
                    <b>{activeItem.resolution}</b>
                  </span>
                  <span>
                    ราคา <b>{activeItem.cost} cr</b>
                  </span>
                  {activeItem.refCount > 0 && (
                    <span>
                      อ้างอิง <b>{activeItem.refCount} รูป</b>
                    </span>
                  )}
                  <span>
                    <Time ms={activeItem.createdAt} />
                  </span>
                </div>
                <p className="result-prompt">{activeItem.prompt}</p>
              </>
            )}
          </section>
        </div>

        {/* ── my history (local) ── */}
        <section className="panel sheet" aria-labelledby="sheet-title">
          <div className="panel-head">
            <span className="panel-idx">03</span>
            <h2 className="panel-title" id="sheet-title">
              ภาพทั้งหมดของฉัน
            </h2>
            <span className="chip">
              <Grid /> {fmtNum(gallery.length)} ภาพ
            </span>
            <span className="spacer" />
            <div className="searchbar">
              <Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาจากพรอมป์หรือโมเดล…"
                aria-label="ค้นหาภาพจากพรอมป์หรือโมเดล"
              />
              {query && (
                <button className="iconbtn sm" onClick={() => setQuery("")} aria-label="ล้างคำค้นหา">
                  <X />
                </button>
              )}
            </div>
            {modelOptions.length > 1 && (
              <select
                className="sel"
                value={galleryModel}
                onChange={(e) => setGalleryModel(e.target.value)}
                aria-label="กรองภาพตามโมเดล"
              >
                <option value="all">ทุกโมเดล</option>
                {modelOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {results.length > 0 && (
              <button className="btn sm ghost" onClick={() => void clearHistory()} title="ลบประวัติที่เก็บในเบราว์เซอร์นี้">
                <Trash /> ล้างประวัติ
              </button>
            )}
          </div>
          <div className="panel-body">
            {gallery.length === 0 ? (
              <div className="empty">
                <Film />
                {results.length === 0
                  ? "ยังไม่มีประวัติในเครื่องนี้ — ภาพที่สร้างจะถูกเก็บไว้ในเบราว์เซอร์นี้คนเดียว"
                  : "ไม่พบภาพที่ตรงกับคำค้นหรือตัวกรองนี้"}
              </div>
            ) : (
              <div className="grid">
                {gallery.map((item) => (
                  <button key={item.id} className="cell" onClick={() => openLightbox(item)}>
                    <span className="cell-tag">
                      <span className="tag chem">{item.aspect}</span>
                      {item.refCount > 0 && <span className="tag ref">{item.refCount} ref</span>}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cell-img" src={item.url} alt={item.prompt.slice(0, 120)} loading="lazy" />
                    <span className="cell-foot">
                      <span className="cell-prompt">{item.prompt}</span>
                      <span className="cell-meta">
                        {item.modelLabel}
                        <i className="dot" />
                        <Time ms={item.createdAt} mode="day" />
                        <i className="dot" />
                        {item.cost} cr
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="foot">
          <span>GenImgs · สตูดิโอสร้างภาพ AI</span>
          <i className="sep" />
          <span>เครดิตทุกบัญชีรีเซ็ต 11:00 น. เวลาไทย</span>
          <i className="sep" />
          <span className="foot-note">ประวัติภาพเก็บในเบราว์เซอร์นี้ · เซิร์ฟเวอร์เก็บไว้ให้แอดมิน</span>
          <span style={{ marginLeft: "auto" }}>
            <Link className="textlink" href="/admin">
              <Lock /> ผู้ดูแลระบบ
            </Link>
          </span>
        </footer>
      </main>

      {lightbox !== null && gallery[lightbox] && (
        <Lightbox
          items={gallery}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onUsePrompt={(item) => {
            setPrompt(item.prompt);
            setLightbox(null);
            promptBox.current?.focus();
            toast("ดึงพรอมป์กลับมาแก้ไขแล้ว", "ok");
          }}
          onUseAsRef={(item) => {
            setLightbox(null);
            void useAsReference(item);
          }}
          busyRef={refBusy}
        />
      )}
    </>
  );
}