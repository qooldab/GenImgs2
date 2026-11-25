/** โดเมนอีเมลชั่วคราวของ Grabmail ที่ Overchat ยอมรับ (grabmail.io ถูกบล็อกตั้งแต่ พ.ย. 2026) */
export const MAIL_FALLBACK_DOMAINS = ["linqmail.com", "mixozia.com", "grabmail.io"];

const SET = new Set(MAIL_FALLBACK_DOMAINS);

export const isGrabmailAddress = (email?: string | null) => {
  const domain = String(email || "").toLowerCase().split("@")[1] || "";
  return SET.has(domain);
};
