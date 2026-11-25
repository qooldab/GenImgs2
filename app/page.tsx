import { Studio } from "@/components/Studio";
import { UIProvider } from "@/components/ui";
import type { Credits } from "@/lib/models";
import { listTokens, summarize } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  let credits: Credits | null = null;
  let initialError: string | undefined;

  try {
    const tokens = await listTokens();
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
  } catch (err) {
    console.error("[genimgs] initial load", err);
    initialError = "เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจสอบค่า DATABASE_URL แล้วลองใหม่อีกครั้ง";
  }

  return (
    <UIProvider>
      <Studio initialCredits={credits} initialError={initialError} />
    </UIProvider>
  );
}