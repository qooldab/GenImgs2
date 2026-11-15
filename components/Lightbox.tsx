"use client";

import { useEffect } from "react";
import type { GalleryItem } from "@/lib/models";
import { Clip, Copy, Download, External, Pencil, Chevron, X } from "./icons";
import { copyText, downloadUrl, fmtNum, Modal, Time, useUI } from "./ui";

export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  onUsePrompt,
  onUseAsRef,
  busyRef,
}: {
  items: GalleryItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onUsePrompt?: (item: GalleryItem) => void;
  onUseAsRef?: (item: GalleryItem) => void;
  busyRef?: boolean;
}) {
  const { toast } = useUI();
  const item = items[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, items.length, onIndex]);

  if (!item) return null;
  const file = `genimgs-${item.id}`;

  return (
    <Modal title="ภาพที่สร้างแล้ว" onClose={onClose} variant="bare">
      <div className="lightbox-bar">
        <span className="tag chem">{item.modelLabel}</span>
        <span className="tag">{item.aspect}</span>
        <span className="tag">{item.resolution}</span>
        {item.refCount > 0 && (
          <span className="tag ref">
            <Clip style={{ width: 9, height: 9, verticalAlign: -1 }} /> {item.refCount} อ้างอิง
          </span>
        )}
        <span className="p">{item.prompt}</span>
        <button className="iconbtn sm" onClick={onClose} aria-label="ปิดภาพขยาย">
          <X />
        </button>
      </div>

      <div className="lightbox-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={item.prompt.slice(0, 160)} />
        {items.length > 1 && (
          <>
            <button
              className="iconbtn"
              style={{ position: "absolute", left: 14, transform: "rotate(180deg)" }}
              onClick={() => onIndex(index - 1)}
              disabled={index === 0}
              aria-label="ภาพก่อนหน้า"
            >
              <Chevron />
            </button>
            <button
              className="iconbtn"
              style={{ position: "absolute", right: 14 }}
              onClick={() => onIndex(index + 1)}
              disabled={index === items.length - 1}
              aria-label="ภาพถัดไป"
            >
              <Chevron />
            </button>
          </>
        )}
      </div>

      <div className="lightbox-bar">
        <span className="mono" style={{ color: "var(--paper-3)" }}>
          {index + 1} / {items.length} · <Time ms={item.createdAt} /> · {fmtNum(item.cost)} เครดิต
        </span>
        <span style={{ marginLeft: "auto" }} />
        {onUsePrompt && (
          <button className="btn sm" onClick={() => onUsePrompt(item)}>
            <Pencil /> ใช้พรอมป์นี้
          </button>
        )}
        {onUseAsRef && (
          <button className="btn sm" onClick={() => onUseAsRef(item)} disabled={busyRef}>
            <Clip /> ใช้เป็นรูปอ้างอิง
          </button>
        )}
        <button
          className="btn sm"
          onClick={async () => toast((await copyText(item.prompt)) ? "คัดลอกพรอมป์แล้ว" : "คัดลอกไม่สำเร็จ", "ok")}
        >
          <Copy /> คัดลอกพรอมป์
        </button>
        <a className="btn sm" href={item.url} target="_blank" rel="noreferrer">
          <External /> เปิดต้นฉบับ
        </a>
        <a className="btn sm primary" href={downloadUrl(item.url, file)} download>
          <Download /> ดาวน์โหลด
        </a>
      </div>
    </Modal>
  );
}