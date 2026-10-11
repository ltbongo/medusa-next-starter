// lib/payfast/checkout.ts — build the signed field list for the custom-integration checkout form
// (POST to /eng/process) or for Onsite (POST to /onsite/process). Pure function: no env, no I/O.
import type { PayfastConfig } from "./config";
import { centsToRand, MIN_AMOUNT_CENTS } from "./money";
import { CHECKOUT_FIELD_ORDER, checkoutSignature, type CheckoutField } from "./signature";

/** Documented payment_method codes (docs, "Payment methods"). Only ONE method may be forced; omit for all. */
export const PAYMENT_METHODS = {
  ef: "EFT", cc: "Credit card", dc: "Debit card", mp: "Masterpass Scan to Pay", mc: "Mobicred",
  sc: "SCode", ss: "SnapScan", zp: "Zapper", mt: "MoreTyme", rc: "Store card", mu: "Mukuru",
  ap: "Apple Pay", sp: "Samsung Pay", cp: "Capitec Pay", ab: "Absa Pay", gp: "Google Pay",
  nd: "Nedbank Direct EFT", pf: "Payflex",
} as const; // NOTE: PayShap has NO documented code (checked 2026-10-08). Never invent one.
export type PaymentMethodCode = keyof typeof PAYMENT_METHODS;

export type Frequency = 1 | 2 | 3 | 4 | 5 | 6; // 1 Daily, 2 Weekly, 3 Monthly, 4 Quarterly, 5 Biannually, 6 Annual

export interface CheckoutInput {
  /** Our unique order/payment id (m_payment_id, max 100). Use the Strapi order number. */
  mPaymentId: string;
  /** Total in cents FROM THE DATABASE — never from the browser. */
  amountCents: number;
  itemName: string;            // required, max 100 (order number when multiple items)
  itemDescription?: string;    // max 255
  buyer?: { nameFirst?: string; nameLast?: string; email?: string; cell?: string };
  /** Default to `${siteUrl}/checkout/return?order=...` etc. notify_url must be publicly reachable over https. */
  returnUrl?: string; cancelUrl?: string; notifyUrl?: string;
  customStr?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;  // pass-through, max 255
  customInt?: Partial<Record<1 | 2 | 3 | 4 | 5, number>>;  // pass-through integers
  emailConfirmation?: boolean;  // send merchant a confirmation (buyer always gets one)
  confirmationAddress?: string;
  paymentMethod?: PaymentMethodCode;
  /** Recurring billing. Passphrase REQUIRED. Credit card only. */
  subscription?: {
    frequency: Frequency;
    cycles: number;              // 0 = indefinite
    billingDate?: string;        // YYYY-MM-DD, defaults to today
    recurringAmountCents?: number; // defaults to amount; min R5.00
    notifyEmail?: boolean; notifyWebhook?: boolean; notifyBuyer?: boolean;
  };
  /** Tokenization (adhoc, charge later via API). Passphrase REQUIRED. Credit card only. */
  tokenization?: boolean;
  /** Split payment (must be enabled on the account). Amounts in CENTS. Not signed. */
  split?: { merchantId: number; amountCents?: number; percentage?: number; minCents?: number; maxCents?: number };
}

export interface BuiltCheckout {
  fields: Array<[string, string]>; // post these, in this order, as hidden inputs
  signature: string;
}

const clip = (s: string, n: number) => s.trim().slice(0, n);

export function buildCheckoutFields(cfg: PayfastConfig, input: CheckoutInput): BuiltCheckout {
  const recurring = !!input.subscription || !!input.tokenization;
  if (input.subscription && input.tokenization) throw new Error("Choose subscription OR tokenization, not both");
  if (recurring && !cfg.passphrase) throw new Error("Subscriptions/tokenization require a passphrase (docs)");
  if (recurring && input.paymentMethod && input.paymentMethod !== "cc") {
    throw new Error("Recurring billing supports credit card only (docs)");
  }
  // R0.00 is allowed only to set up a subscription/tokenization (docs); otherwise min R5.00 in live.
  if (!(recurring && input.amountCents === 0) && input.amountCents < MIN_AMOUNT_CENTS) {
    throw new Error("PayFast minimum is R5.00");
  }
  if (!input.mPaymentId || input.mPaymentId.length > 100) throw new Error("m_payment_id required, max 100 chars");
  if (!input.itemName.trim()) throw new Error("item_name required");

  const v: Partial<Record<CheckoutField, string>> = {
    merchant_id: cfg.merchantId,
    merchant_key: cfg.merchantKey,
    return_url: input.returnUrl ?? `${cfg.siteUrl}/checkout/return?order=${encodeURIComponent(input.mPaymentId)}`,
    cancel_url: input.cancelUrl ?? `${cfg.siteUrl}/checkout/cancel?order=${encodeURIComponent(input.mPaymentId)}`,
    notify_url: input.notifyUrl ?? `${cfg.siteUrl}/api/payfast/itn`,
    name_first: input.buyer?.nameFirst && clip(input.buyer.nameFirst, 100),
    name_last: input.buyer?.nameLast && clip(input.buyer.nameLast, 100),
    email_address: input.buyer?.email && clip(input.buyer.email, 100),
    cell_number: input.buyer?.cell && clip(input.buyer.cell, 100),
    m_payment_id: input.mPaymentId.trim(),
    amount: centsToRand(input.amountCents),
    item_name: clip(input.itemName, 100),
    item_description: input.itemDescription && clip(input.itemDescription, 255),
    email_confirmation: input.emailConfirmation === undefined ? undefined : input.emailConfirmation ? "1" : "0",
    confirmation_address: input.confirmationAddress && clip(input.confirmationAddress, 100),
    payment_method: input.paymentMethod,
  };
  for (const i of [1, 2, 3, 4, 5] as const) {
    const s = input.customStr?.[i];
    if (s !== undefined) v[`custom_str${i}`] = clip(s, 255);
    const n = input.customInt?.[i];
    if (n !== undefined) {
      if (!Number.isInteger(n)) throw new Error(`custom_int${i} must be an integer`);
      v[`custom_int${i}`] = String(n);
    }
  }
  if (input.subscription) {
    const s = input.subscription;
    if (![1, 2, 3, 4, 5, 6].includes(s.frequency)) throw new Error("frequency must be 1..6");
    if (!Number.isInteger(s.cycles) || s.cycles < 0) throw new Error("cycles must be an integer >= 0 (0 = indefinite)");
    if (s.billingDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.billingDate)) throw new Error("billing_date must be YYYY-MM-DD");
    if (s.recurringAmountCents !== undefined && s.recurringAmountCents < MIN_AMOUNT_CENTS) {
      throw new Error("recurring_amount minimum is 5.00");
    }
    v.subscription_type = "1";
    v.billing_date = s.billingDate;
    v.recurring_amount = s.recurringAmountCents === undefined ? undefined : centsToRand(s.recurringAmountCents);
    v.frequency = String(s.frequency);
    v.cycles = String(s.cycles); // "0" is NOT blank and IS signed (docs rule). See SKILL.md "cycles=0" note.
    if (s.notifyEmail !== undefined) v.subscription_notify_email = String(s.notifyEmail);
    if (s.notifyWebhook !== undefined) v.subscription_notify_webhook = String(s.notifyWebhook);
    if (s.notifyBuyer !== undefined) v.subscription_notify_buyer = String(s.notifyBuyer);
  }
  if (input.tokenization) v.subscription_type = "2";

  // Documented order, blanks dropped, values trimmed — the posted values MUST equal the signed values.
  const ordered: Array<[CheckoutField, string]> = [];
  for (const k of CHECKOUT_FIELD_ORDER) {
    const val = v[k];
    if (val !== undefined && val !== null && val.trim() !== "") ordered.push([k, val.trim()]);
  }
  const signature = checkoutSignature(ordered, cfg.passphrase);
  const fields: Array<[string, string]> = [...ordered, ["signature", signature]];

  if (input.split) {
    const sp = input.split;
    if (sp.amountCents === undefined && sp.percentage === undefined) throw new Error("split needs amountCents or percentage");
    const split_payment: Record<string, number> = { merchant_id: sp.merchantId };
    if (sp.percentage !== undefined) split_payment.percentage = sp.percentage;
    if (sp.amountCents !== undefined) split_payment.amount = sp.amountCents;
    if (sp.minCents !== undefined) split_payment.min = sp.minCents;
    if (sp.maxCents !== undefined) split_payment.max = sp.maxCents;
    fields.push(["setup", JSON.stringify({ split_payment })]); // NOT signed (docs)
  }
  return { fields, signature };
}

/** x-www-form-urlencoded body (used for Onsite step 1 and for tests). */
export function toFormBody(fields: Array<[string, string]>): string {
  return new URLSearchParams(fields).toString();
}
