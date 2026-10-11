// lib/payfast/signature.ts — the THREE different PayFast signature rules. Never mix them up.
//  1. Checkout / Onsite (custom integration): fields in DOCUMENTED ORDER, non-blank only, trimmed, + passphrase LAST.
//  2. ITN verification: ALL posted fields in the ORDER RECEIVED (blank ones included), excluding `signature`, + passphrase.
//  3. REST API: header + body + query vars + passphrase, sorted ALPHABETICALLY, non-empty (`testing` excluded).
// All: MD5 hex, lower case, values encoded with pfEncode (PHP urlencode).
import { createHash, timingSafeEqual } from "node:crypto";
import { pfEncode } from "./encoding";

export const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

/**
 * Field order for checkout/onsite signatures = the order of the attribute tables in the docs
 * (Merchant details, Customer details, Transaction details, Transaction options, Payment methods,
 * then Recurring Billing fields). `setup` (split payments) is NOT part of the signature.
 * `fica_idnumber` sits under Merchant details in the docs (after notify_url); the official PHP SDK
 * does not list it — avoid sending it unless a client needs it, and verify in the sandbox if you do.
 */
export const CHECKOUT_FIELD_ORDER = [
  "merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url", "fica_idnumber",
  "name_first", "name_last", "email_address", "cell_number",
  "m_payment_id", "amount", "item_name", "item_description",
  "custom_int1", "custom_int2", "custom_int3", "custom_int4", "custom_int5",
  "custom_str1", "custom_str2", "custom_str3", "custom_str4", "custom_str5",
  "email_confirmation", "confirmation_address",
  "payment_method",
  "subscription_type", "billing_date", "recurring_amount", "frequency", "cycles",
  "subscription_notify_email", "subscription_notify_webhook", "subscription_notify_buyer",
] as const;
export type CheckoutField = (typeof CHECKOUT_FIELD_ORDER)[number];

/** Fields that are posted but excluded from the signature (docs: split payment `setup` "Not included in the signature"). */
export const UNSIGNED_FIELDS = ["setup"] as const;

/** Rule 1 — checkout & onsite. Input must already be trimmed; blank values must already be removed. */
export function checkoutSignature(fields: Array<[CheckoutField, string]>, passphrase: string | null): string {
  let s = fields
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${pfEncode(v.trim())}`)
    .join("&");
  if (passphrase) s += `&passphrase=${pfEncode(passphrase.trim())}`;
  return md5(s);
}

/**
 * Rule 2 — ITN. `pairs` = decoded name/value pairs in the order PayFast posted them.
 * Mirrors the official PHP SDK / docs: stop at `signature` (it is posted last), keep blank values, no trim.
 * Returns the param string WITHOUT passphrase — this exact string is also what you POST to /eng/query/validate.
 */
export function itnParamString(pairs: Array<[string, string]>): string {
  const out: string[] = [];
  for (const [k, v] of pairs) {
    if (k === "signature") break;
    out.push(`${k}=${pfEncode(v)}`);
  }
  return out.join("&");
}

export function itnSignature(paramString: string, passphrase: string | null): string {
  return md5(passphrase ? `${paramString}&passphrase=${pfEncode(passphrase)}` : paramString);
}

/** Rule 3 — REST API. Pass headers (merchant-id, version, timestamp) + body + query vars. Never include `testing`. */
export function apiSignature(vars: Record<string, string | number>, passphrase: string | null): string {
  const all: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (k === "testing") continue; // docs: "When in test mode the testing parameter should be excluded"
    const s = String(v);
    if (s !== "") all[k] = s;
  }
  if (passphrase) all.passphrase = passphrase; // docs: passphrase is sorted together with the other variables
  return md5(
    Object.keys(all)
      .sort()
      .map((k) => `${k}=${pfEncode(all[k])}`)
      .join("&"),
  );
}

/** Constant-time compare of two lower-case hex MD5 strings. */
export function sameSignature(a: string | undefined | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase()), Buffer.from(b));
}
