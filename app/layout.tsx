import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-plex-thai", display: "swap" });
const jet = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jet", display: "swap" });

export const metadata: Metadata = {
  title: "GenImgs — สตูดิโอสร้างภาพ",
  description: "สร้างภาพ AI พร้อมแนบรูปอ้างอิง เลือกโมเดล และเก็บภาพไว้ในคลังกลางของเซิร์ฟเวอร์",
  applicationName: "GenImgs",
};

export const viewport: Viewport = {
  themeColor: "#0c0b0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${plex.variable} ${jet.variable}`}>
      <body>
        <a className="skip" href="#main">ข้ามไปเนื้อหาหลัก</a>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}