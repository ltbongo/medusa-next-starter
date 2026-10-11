// lib/payfast/onsite.ts — Onsite Payments (Beta): step 1 server-side, get a uuid. Server-only.
// Requires HTTPS. email_address is required unless the merchant enabled mobile registration (then cell_number).
import "server-only";
import { getPayfastConfig, onsiteProcessUrl } from "./config";
import { buildCheckoutFields, toFormBody, type CheckoutInput } from "./checkout";

export async function createOnsiteUuid(input: CheckoutInput): Promise<string> {
  if (!input.buyer?.email && !input.buyer?.cell) throw new Error("Onsite needs email_address (or cell_number if mobile registration is enabled)");
  const cfg = getPayfastConfig();
  const { fields } = buildCheckoutFields(cfg, input); // same signature rules as the redirect form
  const res = await fetch(onsiteProcessUrl(cfg), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: toFormBody(fields),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Onsite identifier request failed (${res.status})`); // body may echo fields: don't log it in prod
  const json = JSON.parse(text) as { uuid?: string };
  if (!json.uuid) throw new Error("Onsite response had no uuid");
  return json.uuid;
}
