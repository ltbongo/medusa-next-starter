// lib/payfast/itn-processor.ts — the ITN decision logic, framework-free so it can be unit-tested.
// HTTP status policy (B9 choice, consistent with the docs' retry behaviour):
//   200 = processed, duplicate, or a genuine-but-unusable notification (retrying would not help)
//   400/403 = forged or unverifiable (bad signature, wrong source, validate said INVALID) — PayFast retries a
//             genuine ITN that got non-200 ("immediately, then after 10 minutes, then exponentially longer"),
//             which buys time to fix a passphrase mismatch. NOTE: the SANDBOX sends each ITN only ONCE.
//   503 = transient failure on our side (Strapi down, validate unreachable) so PayFast retries.
import { amountMatches, isPayfastSourceIp, parseItnBody, validateWithPayfast, verifyItnSignature, type ValidateResult } from "./itn";
import { randToCents } from "./money";
import { canTransition, type OrderStore, type OrderStatus } from "./orders";

export interface ItnDeps {
  merchantId: string;
  passphrase: string | null;
  validateUrl: string;
  store: OrderStore;
  isPayfastIp?: (ip: string | null) => Promise<boolean>;
  validate?: (url: string, paramString: string) => Promise<ValidateResult>;
  log?: (event: string, detail: Record<string, unknown>) => void; // never pass secrets or the raw body
}

export interface ItnResult { httpStatus: number; outcome: string }

const PRE_PAYMENT: OrderStatus[] = ["pending_payment", "payment_failed", "expired"];

const cents = (v: string | undefined) => {
  if (!v) return null;
  try { return randToCents(v); } catch { return null; }
};

export async function processItn(rawBody: string, sourceIp: string | null, deps: ItnDeps): Promise<ItnResult> {
  const log = deps.log ?? (() => {});
  const pairs = parseItnBody(rawBody);
  if (pairs.length === 0) return { httpStatus: 400, outcome: "empty_body" };
  const data = Object.fromEntries(pairs) as Record<string, string>;

  // 1) Signature (cheap, no network)
  const sig = verifyItnSignature(pairs, deps.passphrase);
  if (!sig.ok) {
    log("payfast_itn_bad_signature", { pf_payment_id: data.pf_payment_id, m_payment_id: data.m_payment_id });
    return { httpStatus: 400, outcome: "bad_signature" };
  }
  // 2) Source
  const ipOk = await (deps.isPayfastIp ?? isPayfastSourceIp)(sourceIp);
  if (!ipOk) {
    log("payfast_itn_bad_source", { ip: sourceIp, pf_payment_id: data.pf_payment_id });
    return { httpStatus: 403, outcome: "bad_source" };
  }
  // Our extra check: it's for OUR merchant account.
  if (data.merchant_id !== deps.merchantId) {
    log("payfast_itn_wrong_merchant", { pf_payment_id: data.pf_payment_id });
    return { httpStatus: 400, outcome: "wrong_merchant" };
  }
  // 4) Server confirmation (done before touching the DB so forged data never reaches it)
  const v = await (deps.validate ?? validateWithPayfast)(deps.validateUrl, sig.paramString);
  if (v === "ERROR") return { httpStatus: 503, outcome: "validate_unreachable" };
  if (v !== "VALID") {
    log("payfast_itn_validate_invalid", { pf_payment_id: data.pf_payment_id });
    return { httpStatus: 400, outcome: "validate_invalid" };
  }

  const status = (data.payment_status ?? "").toUpperCase();
  const pfPaymentId = data.pf_payment_id ?? null;
  const token = data.token || null;
  const orderNumber = data.m_payment_id || null;

  try {
    const order = orderNumber ? await deps.store.findByOrderNumber(orderNumber) : null;

    // 3) Amount — against OUR stored total, never against anything the browser sent.
    let outcome: string;
    let next: OrderStatus | null = null;
    if (!order) {
      outcome = "review:unknown_order";
    } else if (status === "COMPLETE") {
      // Later subscription cycles arrive with the same m_payment_id + token after the first payment succeeded.
      const isRecurringRepeat = !!token && !PRE_PAYMENT.includes(order.status);
      if (isRecurringRepeat) {
        outcome = "recorded:recurring_payment";
      } else if (!amountMatches(order.totalCents, data.amount_gross)) {
        outcome = "review:amount_mismatch";
        next = "payment_review";
      } else {
        outcome = "applied:paid";
        next = "paid";
      }
    } else if (status === "FAILED") {
      outcome = "applied:payment_failed";
      next = "payment_failed";
    } else if (status === "CANCELLED") {
      outcome = token ? "applied:subscription_cancelled" : "recorded:cancelled";
    } else {
      outcome = `recorded:status_${status || "missing"}`; // pending/unknown: never mark paid
    }

    const { signature: _s, ...payload } = data;
    const inserted = await deps.store.recordPaymentEvent({
      idempotencyKey: `${pfPaymentId ?? "none"}:${status}`,
      orderNumber, pfPaymentId, paymentStatus: status,
      amountGrossCents: cents(data.amount_gross), amountFeeCents: cents(data.amount_fee), amountNetCents: cents(data.amount_net),
      token, outcome, payload,
    });
    // Apply the transition even on a duplicate delivery if a previous attempt failed half-way
    // (event saved, order update failed -> we returned 503 -> PayFast retried). Same-state = no-op.
    if (order && next && order.status !== next && (inserted || PRE_PAYMENT.includes(order.status))) {
      if (canTransition(order.status, next)) {
        await deps.store.updateOrder(order.id, {
          status: next,
          ...(next === "paid" ? { pfPaymentId, paidAt: new Date().toISOString() } : {}),
          ...(token ? { subscriptionToken: token } : {}),
        });
      } else {
        await deps.store.updateOrder(order.id, { status: "payment_review", note: `Unexpected ${order.status} -> ${next} (pf ${pfPaymentId})` });
        outcome = `review:illegal_transition_${order.status}_to_${next}`;
      }
    }
    if (!inserted) return { httpStatus: 200, outcome: "duplicate" }; // idempotent: same ITN delivered again
    log("payfast_itn_processed", { outcome, pf_payment_id: pfPaymentId, m_payment_id: orderNumber });
    return { httpStatus: 200, outcome };
  } catch (err) {
    log("payfast_itn_store_error", { pf_payment_id: pfPaymentId, error: (err as Error).message });
    return { httpStatus: 503, outcome: "store_error" };
  }
}
