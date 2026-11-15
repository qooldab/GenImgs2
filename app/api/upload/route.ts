import { MAX_UPLOAD_BYTES } from "@/lib/models";
import { fail, HttpError, ok } from "@/lib/http";
import { REF_HOST_OK, uploadReference } from "@/lib/overchat";
import { listTokens, pickOrder, refreshTokens } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) throw new HttpError(400, "ไม่พบไฟล์รูปที่ส่งมา");
    const name = (file instanceof File && file.name) || "reference.jpg";
    if (!ALLOWED.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(name)) {
      throw new HttpError(415, "รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ HEIC");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new HttpError(413, "ไฟล์ใหญ่เกิน 3.5 MB — ระบบจะย่อรูปให้ก่อนอัปโหลด ลองรูปที่เล็กลง");
    }
    const tokens = await refreshTokens({ maxAgeMs: 600_000 });
    const pin = Number(form?.get("tokenId"));
    const order = pickOrder(tokens, 0, Number.isInteger(pin) ? pin : null);
    const target = order[0];
    if (!target) throw new HttpError(503, "ยังไม่มีบัญชีที่พร้อมใช้งาน แจ้งผู้ดูแลระบบ");

    const { link, thumb } = await uploadReference(target.token, target.device_uuid, file, name);
    if (!REF_HOST_OK(link)) throw new HttpError(502, "ปลายทางส่งลิงก์รูปที่ไม่รู้จักกลับ");
    return ok({ link, thumb, name, tokenId: target.id });
  } catch (err) {
    return fail(err);
  }
}