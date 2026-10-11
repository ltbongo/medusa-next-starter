// lib/payfast/orders.ts — order state machine + storage interface (Strapi implementation in strapi-store.ts).
export type OrderStatus =
  | "pending_payment"   // order created, buyer sent to PayFast
  | "paid"              // ITN COMPLETE passed all 4 checks — the ONLY way to reach "paid"
  | "payment_failed"    // ITN FAILED
  | "payment_review"    // ITN genuine but something didn't match (amount, merchant) — human must look
  | "expired"           // never paid (cron/admin after N hours). cancel_url alone is NOT proof of anything
  | "refund_pending"    // refund requested via API
  | "partially_refunded"
  | "refunded"
  | "fulfilled";        // shipped/collected (owned by the shipping slice)

export type SubscriptionStatus = "pending" | "active" | "paused" | "cancelled" | "locked";

/** Allowed transitions. Anything else is a bug: log + payment_review, never silently overwrite. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "payment_failed", "payment_review", "expired"],
  payment_failed: ["paid", "payment_review", "expired"], // buyer may retry a new payment on the same order
  payment_review: ["paid", "refund_pending", "expired"],
  expired: ["payment_review"],                          // a late COMPLETE for an expired order needs a human
  paid: ["refund_pending", "fulfilled"],
  refund_pending: ["partially_refunded", "refunded", "paid"],
  partially_refunded: ["refund_pending", "refunded", "fulfilled"],
  refunded: [],
  fulfilled: ["refund_pending"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || ORDER_TRANSITIONS[from].includes(to);
}

export interface OrderRecord {
  id: string;                 // Strapi documentId
  orderNumber: string;        // = m_payment_id (unique)
  status: OrderStatus;
  totalCents: number;         // authoritative amount
  pfPaymentId?: string | null;
  subscriptionToken?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string | null;
}

export interface PaymentEventInput {
  idempotencyKey: string;     // `${pf_payment_id}:${payment_status}` — unique in the store
  orderNumber: string | null;
  pfPaymentId: string | null;
  paymentStatus: string;
  amountGrossCents: number | null;
  amountFeeCents: number | null;
  amountNetCents: number | null;
  token: string | null;
  outcome: string;            // e.g. "applied:paid", "review:amount_mismatch"
  payload: Record<string, string>; // ITN fields minus signature; contains buyer PII — admin-only collection
}

export interface OrderStore {
  findByOrderNumber(orderNumber: string): Promise<OrderRecord | null>;
  /** Insert-once. Return false when the idempotency key already exists (duplicate ITN). */
  recordPaymentEvent(e: PaymentEventInput): Promise<boolean>;
  updateOrder(id: string, patch: Partial<Omit<OrderRecord, "id" | "orderNumber">> & { paidAt?: string; note?: string }): Promise<void>;
}
