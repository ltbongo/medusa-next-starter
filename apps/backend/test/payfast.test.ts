// test/payfast.test.ts — run: npx tsx --test test/payfast.test.ts   (node:test, no extra deps)
// Vectors 1 and 2 are REAL ITN payloads + signatures from the official PayFast PHP SDK test suite
// (github.com/Payfast/payfast-php-sdk tests/PaymentIntegrations/NotificationTest.php).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pfEncode } from "../src/lib/payfast/encoding";
import { apiSignature, checkoutSignature, CHECKOUT_FIELD_ORDER, itnParamString, itnSignature, md5 } from "../src/lib/payfast/signature";
import { callerIp, parseItnBody, verifyItnSignature, amountMatches } from "../src/lib/payfast/itn";
import { buildCheckoutFields } from "../src/lib/payfast/checkout";
import { centsToRand, randToCents } from "../src/lib/payfast/money";
import { processItn } from "../src/lib/payfast/itn-processor";
import type { OrderRecord, OrderStore, PaymentEventInput } from "../src/lib/payfast/orders";
import type { PayfastConfig } from "../src/lib/payfast/config";
import { centsToMedusaAmount, medusaAmountToCents } from "../src/lib/payfast/medusa-amount";

const SDK_VECTOR_1 = { // no passphrase
  m_payment_id: "000000020", pf_payment_id: "1579137", payment_status: "COMPLETE", item_name: "Order #000000020",
  item_description: "", amount_gross: "15.00", amount_fee: "-2.30", amount_net: "12.70",
  custom_str1: "", custom_str2: "", custom_str3: "", custom_str4: "", custom_str5: "",
  custom_int1: "", custom_int2: "", custom_int3: "", custom_int4: "", custom_int5: "",
  name_first: "Tom", name_last: "Tom", email_address: "lindley+user1@appinlet.com", merchant_id: "10027938",
  signature: "4078bca2c8987e0e0c4e7230f2f46323",
};
const SDK_VECTOR_2 = { // passphrase jt7NOE43FZPn
  m_payment_id: "1234", pf_payment_id: "1221576", payment_status: "COMPLETE", item_name: "Order#123",
  item_description: "", amount_gross: "10.00", amount_fee: "-0.23", amount_net: "9.77",
  custom_str1: "", custom_str2: "", custom_str3: "", custom_str4: "", custom_str5: "",
  custom_int1: "", custom_int2: "", custom_int3: "", custom_int4: "", custom_int5: "",
  name_first: "First", name_last: "Last", email_address: "test@test.com", merchant_id: "10000100",
  signature: "ac4c3e993d31b5b9d525dc0087051437",
};
// Encode like PayFast would post it (form encoding); our parser must recover the exact values and order.
const asBody = (o: Record<string, string>) => new URLSearchParams(Object.entries(o)).toString();

test("callerIp prefers x-real-ip, else left-most x-forwarded-for (Traefik client)", () => {
  assert.equal(callerIp(new Headers({ "x-real-ip": "197.97.145.144" })), "197.97.145.144");
  assert.equal(
    callerIp(new Headers({ "x-forwarded-for": "197.97.145.144, 10.0.0.5" })),
    "197.97.145.144",
  );
  assert.equal(
    callerIp(new Headers({ "x-real-ip": "10.0.0.5", "x-forwarded-for": "197.97.145.144, 10.0.0.5" })),
    "197.97.145.144",
  );
});

test("pfEncode matches PHP urlencode", () => {
  assert.equal(pfEncode("a b+c@d.co.za"), "a+b%2Bc%40d.co.za");
  assert.equal(pfEncode("O'Brien (Pty) Ltd! *~"), "O%27Brien+%28Pty%29+Ltd%21+%2A%7E");
  assert.equal(pfEncode("https://x.co.za/a?b=1"), "https%3A%2F%2Fx.co.za%2Fa%3Fb%3D1");
  assert.equal(pfEncode("-_."), "-_.");
});

test("ITN vector 1 (SDK, no passphrase) verifies, blanks included", () => {
  const pairs = parseItnBody(asBody(SDK_VECTOR_1));
  assert.equal(verifyItnSignature(pairs, null).ok, true);
});

test("ITN vector 2 (SDK, passphrase) verifies; wrong passphrase / tampered amount fail", () => {
  const pairs = parseItnBody(asBody(SDK_VECTOR_2));
  assert.equal(verifyItnSignature(pairs, "jt7NOE43FZPn").ok, true);
  assert.equal(verifyItnSignature(pairs, null).ok, false);
  const tampered = parseItnBody(asBody({ ...SDK_VECTOR_2, amount_gross: "11.00" }));
  assert.equal(verifyItnSignature(tampered, "jt7NOE43FZPn").ok, false);
});

test("validate param string excludes signature and passphrase", () => {
  const ps = itnParamString(parseItnBody(asBody(SDK_VECTOR_2)));
  assert.ok(!ps.includes("signature=") && !ps.includes("passphrase="));
  assert.equal(itnSignature(ps, "jt7NOE43FZPn"), SDK_VECTOR_2.signature);
});

test("checkout signature: documented order, blanks dropped, passphrase last", () => {
  const sig = checkoutSignature([["merchant_id", "10000100"], ["merchant_key", "46f0cd694581a"], ["amount", "100.00"], ["item_name", "Test Product"], ["item_description", ""]], "pass word");
  assert.equal(sig, md5("merchant_id=10000100&merchant_key=46f0cd694581a&amount=100.00&item_name=Test+Product&passphrase=pass+word"));
});

const cfg: PayfastConfig = { mode: "sandbox", merchantId: "10000100", merchantKey: "46f0cd694581a", passphrase: "secret phrase", siteUrl: "https://shop.example.co.za" };

test("buildCheckoutFields orders fields per docs, signs only signed fields, puts setup after signature", () => {
  const { fields, signature } = buildCheckoutFields(cfg, {
    mPaymentId: "BB-0001", amountCents: 12345, itemName: "Order BB-0001",
    buyer: { email: "a@b.co.za", nameFirst: "Ann" }, customStr: { 1: "x" },
    split: { merchantId: 10000105, percentage: 10 },
  });
  const names = fields.map(([k]) => k);
  const signedNames = names.slice(0, names.indexOf("signature"));
  const idx = signedNames.map((n) => (CHECKOUT_FIELD_ORDER as readonly string[]).indexOf(n));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  assert.equal(names.at(-1), "setup");
  assert.equal(fields.find(([k]) => k === "amount")?.[1], "123.45");
  const signed = fields.slice(0, names.indexOf("signature")) as Array<[any, string]>;
  assert.equal(signature, checkoutSignature(signed, cfg.passphrase));
});

test("subscription rules", () => {
  assert.throws(() => buildCheckoutFields({ ...cfg, passphrase: null }, { mPaymentId: "S1", amountCents: 9900, itemName: "Box", subscription: { frequency: 3, cycles: 0 } }), /passphrase/);
  const { fields } = buildCheckoutFields(cfg, { mPaymentId: "S1", amountCents: 0, itemName: "Box", subscription: { frequency: 3, cycles: 0, recurringAmountCents: 9900 } });
  assert.equal(fields.find(([k]) => k === "cycles")?.[1], "0");
  assert.equal(fields.find(([k]) => k === "subscription_type")?.[1], "1");
  assert.throws(() => buildCheckoutFields(cfg, { mPaymentId: "X", amountCents: 499, itemName: "Too cheap" }), /R5/);
});

test("Medusa ZAR amounts are already cents (24899 → PayFast 248.99)", () => {
  assert.equal(medusaAmountToCents(24899, "zar"), 24899);
  assert.equal(centsToMedusaAmount(24899), 24899);
  assert.equal(centsToRand(medusaAmountToCents(24899, "ZAR")), "248.99");
});

test("money helpers", () => {
  assert.equal(centsToRand(500), "5.00");
  assert.equal(centsToRand(1234567), "12345.67");
  assert.equal(randToCents("-4.60"), -460);
  assert.equal(randToCents("200"), 20000);
  assert.equal(amountMatches(1500, "15.00"), true);
  assert.equal(amountMatches(1500, "15.01"), false);
});

test("API signature sorts keys incl. passphrase and ignores `testing`", () => {
  const sig = apiSignature({ "merchant-id": "10000100", version: "v1", timestamp: "2026-10-08T10:00:00+02:00", testing: "true", amount: 500 }, "pp");
  assert.equal(sig, md5("amount=500&merchant-id=10000100&passphrase=pp&timestamp=2026-10-08T10%3A00%3A00%2B02%3A00&version=v1"));
});

class MemStore implements OrderStore {
  orders = new Map<string, OrderRecord>();
  events = new Map<string, PaymentEventInput>();
  async findByOrderNumber(n: string) { return this.orders.get(n) ?? null; }
  async recordPaymentEvent(e: PaymentEventInput) { if (this.events.has(e.idempotencyKey)) return false; this.events.set(e.idempotencyKey, e); return true; }
  async updateOrder(id: string, patch: Partial<OrderRecord>) { for (const o of this.orders.values()) if (o.id === id) Object.assign(o, patch); }
}

test("processItn: happy path, duplicate, bad source, amount mismatch, validate down", async () => {
  const store = new MemStore();
  store.orders.set("1234", { id: "doc1", orderNumber: "1234", status: "pending_payment", totalCents: 1000 });
  const deps = { merchantId: "10000100", passphrase: "jt7NOE43FZPn", validateUrl: "x", store,
    isPayfastIp: async () => true, validate: async () => "VALID" as const };
  const body = asBody(SDK_VECTOR_2);
  assert.deepEqual(await processItn(body, "41.74.179.200", deps), { httpStatus: 200, outcome: "applied:paid" });
  assert.equal(store.orders.get("1234")!.status, "paid");
  assert.deepEqual(await processItn(body, "41.74.179.200", deps), { httpStatus: 200, outcome: "duplicate" });
  assert.equal((await processItn(body, "1.2.3.4", { ...deps, isPayfastIp: async () => false })).httpStatus, 403);
  assert.equal((await processItn(body, "x", { ...deps, validate: async () => "ERROR" as const })).httpStatus, 503);
  const store2 = new MemStore();
  store2.orders.set("1234", { id: "doc2", orderNumber: "1234", status: "pending_payment", totalCents: 999 });
  assert.equal((await processItn(body, "x", { ...deps, store: store2 })).outcome, "review:amount_mismatch");
  assert.equal(store2.orders.get("1234")!.status, "payment_review");
});
