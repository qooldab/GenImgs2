"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Aperture, ArrowLeft, Eye, EyeOff, Lock } from "@/components/icons";
import { api, useUI } from "@/components/ui";

export function Login() {
  const router = useRouter();
  const { toast } = useUI();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/login", { method: "POST", json: { password } });
      toast("เข้าสู่ระบบผู้ดูแลแล้ว", "ok");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="panel login" onSubmit={submit}>
        <div className="panel-body">
          <span className="login-mark">
            <Aperture />
          </span>
          <h1 style={{ fontSize: 21 }}>
            Gen<em style={{ fontStyle: "normal", color: "var(--safe)" }}>Imgs</em> · ผู้ดูแลระบบ
          </h1>
          <p style={{ fontSize: 13, color: "var(--paper-3)", marginTop: 6 }}>
            จัดการบัญชี เครดิต และภาพทั้งหมดของเซิร์ฟเวอร์ — เฉพาะผู้ดูแลเท่านั้น
          </p>

          <div className="block" style={{ marginTop: 20 }}>
            <label className="lbl" htmlFor="admin-pw">
              รหัสผ่านผู้ดูแล
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="admin-pw"
                className="inp"
                style={{ flex: 1, minWidth: 0 }}
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                data-autofocus
                placeholder="••••••••"
              />
              <button
                type="button"
                className="iconbtn"
                style={{ width: 40, height: 40 }}
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          {error && (
            <div className="alert bad">
              <Alert />
              <span>{error}</span>
            </div>
          )}

          <button className="go" style={{ marginTop: 18 }} type="submit" disabled={!password || busy}>
            {busy ? <span className="spinner" style={{ borderTopColor: "var(--safe-ink)" }} /> : <Lock />}
            {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
          </button>

          <Link className="textlink" href="/" style={{ marginTop: 14 }}>
            <ArrowLeft /> กลับไปหน้าสร้างภาพ
          </Link>
        </div>
      </form>
    </div>
  );
}