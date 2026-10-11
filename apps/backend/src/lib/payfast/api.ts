// lib/payfast/api.ts — PayFast REST API client (https://developers.payfast.co.za/api). Server-only.
// Headers on EVERY call: merchant-id, version (v1), timestamp (ISO-8601), signature (rule 3, see signature.ts).
// A passphrase must be set on the merchant account before any API call works.
// Sandbox: same base URL + ?testing=true (excluded from the signature).
import { getPayfastConfig, PAYFAST_API_BASE, type PayfastConfig } from "./config";
import { apiSignature } from "./signature";

type Scalar = string | number; // no booleans: send 1/0 so the signed value equals the sent value

/** "YYYY-MM-DDTHH:MM:SS+02:00" in SAST (docs: offset optional, GMT+2 assumed if absent). */
export function payfastTimestamp(d = new Date()): string {
  const sast = new Date(d.getTime() + 2 * 3600_000);
  return sast.toISOString().slice(0, 19) + "+02:00";
}

export interface ApiResult<T = unknown> { httpStatus: number; body: T }

export async function payfastApi<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  opts: { query?: Record<string, Scalar>; body?: Record<string, Scalar> } = {},
  cfg: PayfastConfig = getPayfastConfig(),
): Promise<ApiResult<T>> {
  if (!cfg.passphrase) throw new Error("PayFast API needs PAYFAST_PASSPHRASE");
  const headers: Record<string, string> = {
    "merchant-id": cfg.merchantId,
    version: "v1",
    timestamp: payfastTimestamp(),
  };
  const query = { ...(opts.query ?? {}) };
  const body = opts.body ?? {};
  headers.signature = apiSignature({ ...headers, ...query, ...body }, cfg.passphrase);
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  if (cfg.mode === "sandbox") qs.set("testing", "true");
  const url = `${PAYFAST_API_BASE}${path}${qs.toString() ? `?${qs}` : ""}`;
  const hasBody = Object.keys(body).length > 0;
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(hasBody ? { "content-type": "application/json" } : {}) },
    body: hasBody ? JSON.stringify(body) : undefined, // docs: JSON (single level) or x-www-form-urlencoded
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* history endpoints may return CSV text */ }
  if (res.status === 429) throw new Error("PayFast API rate limit (429): wait a few minutes and retry");
  return { httpStatus: res.status, body: parsed as T };
}

// ---- Endpoints (all documented) ------------------------------------------------------------------
export const ping = () => payfastApi("GET", "/ping"); // live answers "Payfast API", sandbox "API V1"

// Recurring billing (token = ITN `token`; the sandbox dashboard does NOT show it — capture it from the ITN)
export const fetchSubscription = (token: string) => payfastApi("GET", `/subscriptions/${token}/fetch`);
export const pauseSubscription = (token: string, cycles?: number) =>
  payfastApi("PUT", `/subscriptions/${token}/pause`, { body: cycles ? { cycles } : {} }); // default 1 cycle
export const unpauseSubscription = (token: string) => payfastApi("PUT", `/subscriptions/${token}/unpause`);
export const cancelSubscription = (token: string) => payfastApi("PUT", `/subscriptions/${token}/cancel`); // buyer gets an email
export const updateSubscription = (token: string, u: { cycles?: number; frequency?: 1 | 2 | 3 | 4 | 5 | 6; run_date?: string; amount?: number /* cents */ }) => {
  const body = Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)) as Record<string, Scalar>;
  if (Object.keys(body).length === 0) throw new Error("update needs at least one field");
  return payfastApi("PATCH", `/subscriptions/${token}/update`, { body });
};
/** Tokenization charge. amount in CENTS, no decimals. Success: data.response === true + pf_payment_id. An ITN follows by default. */
export const chargeToken = (token: string, c: { amount: number; item_name: string; item_description?: string; m_payment_id?: string; cc_cvv?: string; setup?: string }) => {
  if (!Number.isInteger(c.amount) || c.amount <= 0) throw new Error("amount must be integer cents");
  const body = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== "")) as Record<string, Scalar>;
  return payfastApi("POST", `/subscriptions/${token}/adhoc`, { body });
};

// Transaction history (response is CSV inside JSON)
export const historyRange = (q: { from?: string; to?: string; limit?: number; offset?: number }) =>
  payfastApi("GET", "/transactions/history", { query: q as Record<string, Scalar> });
export const historyPeriod = (period: "daily" | "weekly" | "monthly", q: { date?: string; limit?: number; offset?: number }) =>
  payfastApi("GET", `/transactions/history/${period}`, { query: q as Record<string, Scalar> });

// Credit card transaction query: id = pf_payment_id, or token for subscriptions
export const queryCardTransaction = (id: string) => payfastApi("GET", `/process/query/${id}`);

// Refunds (id = pf_payment_id). ALWAYS query first. The PHP SDK refuses refunds in sandbox mode.
export interface RefundQuery {
  token: string; funding_type: string; amount_original: number; amount_available_for_refund: number;
  status: "REFUNDABLE" | "COMPLETED" | "NOT_AVAILABLE"; errors?: string[];
  refund_full: { method: "PAYMENT_SOURCE" | "BANK_PAYOUT" | "NOT_AVAILABLE" };
  refund_partial: { method: "PAYMENT_SOURCE" | "BANK_PAYOUT" | "NOT_AVAILABLE" };
  bank_names: Array<{ bank_name: string; label: string }>;
}
export const refundQuery = (pfPaymentId: string) => payfastApi<RefundQuery>("GET", `/refunds/query/${pfPaymentId}`);
export const refundRetrieve = (pfPaymentId: string) => payfastApi("GET", `/refunds/${pfPaymentId}`);
export async function refundCreate(
  pfPaymentId: string,
  r: { amountCents: number; reason: string; notifyBuyer: boolean; notifyMerchant?: boolean;
       bank?: { holder: string; bankName: string; branchCode: string; accountNumber: string; accountType: "current" | "savings" } },
) {
  if (r.reason.length < 3 || r.reason.length > 255) throw new Error("reason must be 3-255 chars");
  const q = await refundQuery(pfPaymentId);
  if (q.httpStatus !== 200) throw new Error(`refund query failed (${q.httpStatus})`);
  const info = q.body;
  if (info.status !== "REFUNDABLE") throw new Error(`not refundable: ${info.status} ${(info.errors ?? []).join("; ")}`);
  if (r.amountCents > info.amount_available_for_refund) throw new Error("amount exceeds amount_available_for_refund");
  const full = r.amountCents === info.amount_original;
  const method = (full ? info.refund_full : info.refund_partial).method;
  if (method === "NOT_AVAILABLE") throw new Error(`${full ? "full" : "partial"} refund not available`);
  const body: Record<string, Scalar> = {
    amount: r.amountCents, reason: r.reason, notify_buyer: r.notifyBuyer ? 1 : 0,
    ...(r.notifyMerchant !== undefined ? { notify_merchant: r.notifyMerchant ? 1 : 0 } : {}),
  };
  if (method === "BANK_PAYOUT") {
    if (!r.bank) throw new Error("BANK_PAYOUT refund needs the buyer's bank details");
    if (!info.bank_names.some((b) => b.bank_name === r.bank!.bankName)) throw new Error("bank_name must come from bank_names");
    Object.assign(body, {
      bank_account_holder: r.bank.holder, bank_name: r.bank.bankName, bank_branch_code: r.bank.branchCode,
      bank_account_number: r.bank.accountNumber, bank_account_type: r.bank.accountType,
    }); // personal data: never log, never store after the refund
  }
  return payfastApi("POST", `/refunds/${pfPaymentId}`, { body });
}
