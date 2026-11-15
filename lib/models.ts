export type ModelId = "grok-imagine-image" | "gpt-image-2-5-flare" | "gpt-image-2-5-sunburst";

export type ModelSpec = {
  id: ModelId;
  label: string;
  model: string;
  vendor: string;
  cost: number;
  maxFiles: number;
  blurb: string;
  strength: string;
};

export const RESOLUTION = "1K";
export const ASPECTS = ["1:1", "4:3", "3:4", "16:9", "9:16"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const MODELS: ModelSpec[] = [
  {
    id: "grok-imagine-image",
    label: "Grok Imagine",
    model: "xai/grok-imagine-image",
    vendor: "xAI",
    cost: 15,
    maxFiles: 3,
    blurb: "เร็วที่สุด เหมาะกับคอนเซปต์และภาพร่างไอเดีย",
    strength: "เร็ว · คุ้มสุด",
  },
  {
    id: "gpt-image-2-5-flare",
    label: "GPT Image 2.5 Flare",
    model: "openai/gpt-image-2.5/flare",
    vendor: "OpenAI",
    cost: 25,
    maxFiles: 16,
    blurb: "แสงสมจริง อ่านคำสั่งยาวได้แม่น ใส่ตัวหนังสือในภาพได้",
    strength: "สมจริง · เลย์เอาต์แม่น",
  },
  {
    id: "gpt-image-2-5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    model: "openai/gpt-image-2.5/sunburst",
    vendor: "OpenAI",
    cost: 25,
    maxFiles: 16,
    blurb: "รายละเอียดสูง เก็บลวดลายและของเล็กได้ดี",
    strength: "รายละเอียดสูง",
  },
];

/** ต้นทุนต่ำสุดต่อภาพ — บัญชีที่เครดิตต่ำกว่านี้ใช้งานไม่ได้จริง */
export const MIN_COST = Math.min(...MODELS.map((m) => m.cost));

export const getModel = (id: string): ModelSpec | undefined => MODELS.find((m) => m.id === id);

export const REF_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
export const MAX_UPLOAD_BYTES = 3_500_000;

/** รูปร่างข้อมูลที่หน้าเว็บใช้แสดงภาพที่สร้างเสร็จแล้ว */
export type GalleryItem = {
  id: number;
  url: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  aspect: string;
  resolution: string;
  cost: number;
  createdAt: number;
  refCount: number;
};

export type Credits = {
  total: number;
  usable: number;
  accounts?: number;
  tokens?: number;
  known: boolean;
  checkedAt: number | null;
  nextResetAt: number;
};

/** รอบเครดิตรีเซ็ต 11:00 เวลาไทย — คีย์วันคือวันที่ก่อนถึงเวลารีเซ็ต */
export const resetDayKey = (now = new Date()) =>
  new Date(now.getTime() + 7 * 3600e3 - 11 * 3600e3).toISOString().slice(0, 10);