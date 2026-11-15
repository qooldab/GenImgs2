import type { ResultRow, TokenRow } from "@/lib/db";
import type { CreditSummary } from "@/lib/store";

export type AdminToken = TokenRow;
export type AdminResult = ResultRow;
export type Summary = CreditSummary;
export type TokenPayload = { tokens: AdminToken[]; summary?: Summary };

export type DailyReport = {
  claimed: number;
  gained: number;
  skipped: number;
  failed: number;
  pending: number;
  failures: { id: number; message: string }[];
};