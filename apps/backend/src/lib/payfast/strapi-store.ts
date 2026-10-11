// lib/payfast/strapi-store.ts — OrderStore on Strapi v5 REST (documentId). For Strapi v4 use numeric `id`
// and read fields from `data.attributes`. Create content types first:
//   Order: orderNumber (UID/text, unique, required), status (enumeration = OrderStatus), totalCents (integer),
//          currency (text, "ZAR"), items (json), customer fields, pfPaymentId (text), subscriptionToken (text),
//          paidAt (datetime), note (text)
//   PaymentEvent: idempotencyKey (text, UNIQUE, required), orderNumber, pfPaymentId, paymentStatus, amountGrossCents,
//          amountFeeCents, amountNetCents (integers), token, outcome (text), payload (json)
// Both collections: NO public role permissions. Access with a server-only API token scoped to these types.
import "server-only";
import type { OrderRecord, OrderStore, PaymentEventInput } from "./orders";

const base = () => (process.env.STRAPI_URL ?? "").replace(/\/+$/, "");
const headers = () => ({
  Authorization: `Bearer ${process.env.STRAPI_API_TOKEN ?? ""}`,
  "Content-Type": "application/json",
});

async function strapi(path: string, init?: RequestInit) {
  const res = await fetch(`${base()}${path}`, { ...init, headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  return res;
}

export const strapiOrderStore: OrderStore = {
  async findByOrderNumber(orderNumber) {
    const q = new URLSearchParams({ "filters[orderNumber][$eq]": orderNumber, "pagination[pageSize]": "1" });
    const res = await strapi(`/api/orders?${q}`);
    if (!res.ok) throw new Error(`Strapi orders lookup failed: ${res.status}`); // transient -> caller returns 5xx
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };
    const d = json.data[0];
    if (!d) return null;
    return {
      id: String(d.documentId),
      orderNumber: String(d.orderNumber),
      status: d.status as OrderRecord["status"],
      totalCents: Number(d.totalCents),
      pfPaymentId: (d.pfPaymentId as string) ?? null,
      subscriptionToken: (d.subscriptionToken as string) ?? null,
      customerName: d.customerName != null ? String(d.customerName) : undefined,
      customerPhone: d.customerPhone != null ? String(d.customerPhone) : undefined,
      customerEmail: d.customerEmail != null ? String(d.customerEmail) : null,
    };
  },
  async recordPaymentEvent(e: PaymentEventInput) {
    const res = await strapi(`/api/payment-events/record`, {
      method: "POST",
      body: JSON.stringify(e),
    });
    if (res.status === 201) return true;
    if (res.status === 200) return false; // duplicate idempotencyKey
    throw new Error(`Strapi payment-event insert failed: ${res.status}`);
  },
  async updateOrder(id, patch) {
    const res = await strapi(`/api/orders/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ data: patch }) });
    if (!res.ok) throw new Error(`Strapi order update failed: ${res.status}`);
  },
};
