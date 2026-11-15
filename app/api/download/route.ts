import { fail, HttpError } from "@/lib/http";
import { IMAGE_HOST_OK } from "@/lib/overchat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const url = p.get("url") || "";
    if (!IMAGE_HOST_OK(url)) throw new HttpError(400, "ลิงก์รูปภาพไม่อยู่ในโดเมนที่อนุญาต");
    const name = (p.get("name") || "genimgs").replace(/[^\w.-]/g, "-").slice(0, 60);

    const upstream = await fetch(url, { signal: AbortSignal.timeout(45_000), cache: "no-store" });
    if (!upstream.ok || !upstream.body) throw new HttpError(502, `ดึงรูปจากต้นทางไม่สำเร็จ (HTTP ${upstream.status})`);
    const type = upstream.headers.get("content-type") || "image/png";
    const ext = type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : "png";

    return new Response(upstream.body, {
      headers: {
        "content-type": type,
        "content-disposition": `attachment; filename="${name}.${ext}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return fail(err);
  }
}