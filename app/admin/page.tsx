import type { Metadata } from "next";
import { Console } from "@/components/admin/Console";
import { Login } from "@/components/admin/Login";
import { UIProvider } from "@/components/ui";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GenImgs — ผู้ดูแลระบบ",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const authed = await isAdmin();
  return <UIProvider>{authed ? <Console /> : <Login />}</UIProvider>;
}