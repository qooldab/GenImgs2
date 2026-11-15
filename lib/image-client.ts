import { MAX_UPLOAD_BYTES } from "./models";

const SENDABLE = /^image\/(jpeg|jpg|png|webp)$/i;
const TARGET = Math.floor(MAX_UPLOAD_BYTES * 0.9);

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** ย่อ/บีบรูปให้ต่ำกว่าลิมิตของ Vercel ก่อนส่งขึ้นเซิร์ฟเวอร์ (คงสัดส่วน ไม่ครอป) */
export async function prepareImage(file: File): Promise<File> {
  if (file.size <= TARGET && SENDABLE.test(file.type)) return file;
  if (file.size <= MAX_UPLOAD_BYTES && /^image\/(heic|heif)$/i.test(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error(`เปิดไฟล์ ${file.name} ไม่ได้ในเบราว์เซอร์ และไฟล์ใหญ่เกิน 3.5 MB — แปลงเป็น JPG/PNG ก่อนแนบ`);
  }

  const base = file.name.replace(/\.[^.]+$/, "") || "reference";
  try {
    for (const side of [2400, 2000, 1600, 1280]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const [type, ext, quality] of [
        ["image/webp", "webp", 0.92],
        ["image/webp", "webp", 0.8],
        ["image/jpeg", "jpg", 0.86],
      ] as const) {
        const blob = await toBlob(canvas, type, quality);
        if (blob && blob.size <= TARGET) return new File([blob], `${base}.${ext}`, { type });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error(`ย่อรูป ${file.name} ให้ต่ำกว่า 3.5 MB ไม่สำเร็จ ลองครอปรูปให้เล็กลงก่อนแนบ`);
}

export const isImageFile = (file: File) =>
  /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);