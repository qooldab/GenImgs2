import { Studio } from "@/components/Studio";
import { UIProvider } from "@/components/ui";
import type { Credits, GalleryItem } from "@/lib/models";
import { listTokens, publicResult, publicResults, summarize } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  let credits: Credits | null = null;
  let results: GalleryItem[] = [];
  let initialError: string | undefined;

  try {
    const [tokens, rows] = await Promise.all([listTokens(), publicResults(60)]);
    const s = summarize(tokens);
    credits = {
      total: s.total,
      usable: s.usable,
      accounts: s.accounts,
      tokens: s.tokenCount,
      known: s.known,
      checkedAt: s.checkedAt,
      nextResetAt: s.nextResetAt,
    };
    results = rows.map(publicResult);
  } catch (err) {
    console.error("[genimgs] initial load", err);
    initialError = "เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจสอบค่า DATABASE_URL แล้วลองใหม่อีกครั้ง";
  }

  return (
    <UIProvider>
      <Studio initialCredits={credits} initialResults={results} initialError={initialError} />
    </UIProvider>
  );
}