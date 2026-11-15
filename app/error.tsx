"use client";

import { Aperture, Refresh } from "@/components/icons";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="login-wrap">
      <div className="panel login">
        <div className="panel-body">
          <span className="login-mark">
            <Aperture />
          </span>
          <h1 style={{ fontSize: 19, marginBottom: 8 }}>หน้านี้สะดุด</h1>
          <p style={{ fontSize: 13.5, color: "var(--paper-2)" }}>
            เกิดข้อผิดพลาดที่ไม่คาดคิด {error.digest ? `(รหัส ${error.digest})` : ""} ลองโหลดใหม่อีกครั้ง
            ถ้ายังเจออยู่ให้แจ้งผู้ดูแลระบบ
          </p>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={reset}>
            <Refresh /> โหลดใหม่
          </button>
        </div>
      </div>
    </div>
  );
}