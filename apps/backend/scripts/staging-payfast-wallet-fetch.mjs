#!/usr/bin/env node
import https from "node:https";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const io = require("socket.io-client");

/**
 * Medusa staging PayFast sandbox wallet payment via fetch + cookie jar (no Puppeteer).
 * Mirrors staging-payfast-wallet-e2e.mjs through PayFast redirect, then uses sandbox JSON
 * endpoints (/eng/method/WalletFunds/{uuid}/pay, /eng/process/finish/{uuid}).
 *
 * Env:
 *   MEDUSA_BACKEND_URL (default staging API)
 *   MEDUSA_PUBLISHABLE_KEY | MEDUSA_STAGING_PUBLISHABLE_KEY
 *   EXISTING_ORDER_ID — skip cart creation when PAYFAST_SESSION_JSON is set
 *   PAYFAST_SESSION_JSON — optional { action, fields } from prior checkout
 *
 * Logs order id + step outcomes only (no secrets).
 */
const API = (
  process.env.MEDUSA_BACKEND_URL ?? "https://medusa-next-starter-api.demo.b9design.co.za"
).replace(/\/+$/, "");
const STOREFRONT = (
  process.env.MEDUSA_STOREFRONT_URL ?? "https://medusa-next-starter.demo.b9design.co.za"
).replace(/\/+$/, "");

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function resolvePublishableKey() {
  const fromEnv = process.env.MEDUSA_PUBLISHABLE_KEY?.trim();
  if (fromEnv) return fromEnv;
  const home = await fetch(`${STOREFRONT}/za`, { headers: { "User-Agent": UA } });
  const html = await home.text();
  const layoutChunk =
    html.match(/\/_next\/static\/chunks\/app\/%5BcountryCode%5D\/\(main\)\/layout-[^"]+\.js/)?.[0];
  if (!layoutChunk) throw new Error("layout_chunk_not_found");
  const js = await fetch(`${STOREFRONT}${layoutChunk}`, { headers: { "User-Agent": UA } }).then(
    (r) => r.text(),
  );
  const pk = js.match(/pk_[a-f0-9]{20,}/)?.[0];
  if (!pk) throw new Error("publishable_key_not_in_bundle");
  return pk;
}

let PK = "";

function storeHeaders() {
  return {
    "Content-Type": "application/json",
    "x-publishable-api-key": PK,
  };
}

/** @param {string} path */
async function store(path, init = {}) {
  const res = await fetch(`${API}/store${path}`, {
    ...init,
    headers: { ...storeHeaders(), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`store ${path} ${res.status}: ${body.message ?? body.type ?? res.statusText}`);
  }
  return body;
}

class CookieJar {
  /** @type {Map<string, string>} */
  #cookies = new Map();

  /** @param {Response} res */
  ingest(res) {
    const lines = res.headers.getSetCookie?.() ?? [];
    for (const line of lines) {
      const pair = line.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const key = pair.slice(0, eq).trim();
      const val = decodeURIComponent(pair.slice(eq + 1).trim());
      this.#cookies.set(key, val);
    }
  }

  /** @param {string} name */
  get(name) {
    return this.#cookies.get(name);
  }

  header() {
    if (!this.#cookies.size) return undefined;
    return [...this.#cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

/** @param {CookieJar} jar @param {string} url */
async function fetchWithJar(jar, url, init = {}) {
  /** @type {Record<string, string>} */
  const headers = { "User-Agent": UA, ...(init.headers ?? {}) };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { ...init, headers });
  jar.ingest(res);
  return res;
}

/** @param {string} html @param {string} name */
function metaContent(html, name) {
  return (html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`, "i")) ?? [])[1];
}

/** @param {string} html */
function jsRedirectUrl(html) {
  const m = html.match(/location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i);
  return m?.[1];
}

/** Staging storefront uses a demo cert; verify PayFast separately. */
async function fetchReturnPage(url) {
  const host = new URL(url).hostname;
  if (!host.endsWith(".demo.b9design.co.za")) {
    return fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  }
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { rejectUnauthorized: false, headers: { "User-Agent": UA } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          fetchReturnPage(next).then(resolve, reject);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            text: async () => body,
          });
        });
      },
    );
    req.on("error", reject);
  });
}

async function createOrderAndPayfastSession() {
  const { regions } = await store("/regions");
  const region = regions?.find((r) => r.currency_code === "zar") ?? regions?.[0];
  if (!region?.id) throw new Error("no_region");

  const { products: preferred } = await store("/products?handle=food-maize-5kg&limit=1").catch(() => ({
    products: [],
  }));
  const { products: listed } = await store("/products?limit=20");
  const products = [
    ...(preferred ?? []),
    ...(listed ?? []).filter((p) => !preferred?.some((x) => x.id === p.id)),
  ];

  let variantId;
  let cartId;
  for (const p of products) {
    const v = p.variants?.[0];
    if (!v?.id) continue;
    const cartProbe = await store("/carts", {
      method: "POST",
      body: JSON.stringify({ region_id: region.id }),
    });
    const cid = cartProbe.cart.id;
    const addRes = await fetch(`${API}/store/carts/${cid}/line-items`, {
      method: "POST",
      headers: storeHeaders(),
      body: JSON.stringify({ variant_id: v.id, quantity: 1 }),
    });
    if (addRes.ok) {
      variantId = v.id;
      cartId = cid;
      break;
    }
  }
  if (!variantId || !cartId) {
    throw new Error("no_priced_variant_for_zar_region");
  }

  await store(`/carts/${cartId}`, {
    method: "POST",
    body: JSON.stringify({
      email: "sbtu01@payfast.co.za",
      shipping_address: {
        first_name: "Sandbox",
        last_name: "Wallet",
        address_1: "1 Test St",
        city: "Pretoria",
        country_code: "za",
        postal_code: "0001",
        province: "gp",
      },
      billing_address: {
        first_name: "Sandbox",
        last_name: "Wallet",
        address_1: "1 Test St",
        city: "Pretoria",
        country_code: "za",
        postal_code: "0001",
        province: "gp",
      },
    }),
  });

  const { shipping_options } = await store(`/shipping-options?cart_id=${cartId}`);
  const shippingOption =
    shipping_options?.find((o) => o.name?.includes("Staging PayFast")) ?? shipping_options?.[0];
  if (!shippingOption?.id) throw new Error("no_shipping_options_for_cart");

  await store(`/carts/${cartId}/shipping-methods`, {
    method: "POST",
    body: JSON.stringify({ option_id: shippingOption.id }),
  });

  const providers = await store(`/payment-providers?region_id=${region.id}`);
  if (!providers?.payment_providers?.find((p) => p.id === "pp_payfast")) {
    throw new Error("pp_payfast_not_in_region");
  }

  const { payment_collection } = await store("/payment-collections", {
    method: "POST",
    body: JSON.stringify({ cart_id: cartId }),
  });
  const pcId = payment_collection.id;

  const sessionRes = await store(`/payment-collections/${pcId}/payment-sessions`, {
    method: "POST",
    body: JSON.stringify({ provider_id: "pp_payfast" }),
  });
  const session = sessionRes.payment_collection?.payment_sessions?.find((s) => s.provider_id === "pp_payfast");
  const data = session?.data;
  if (!data?.action || !data?.fields?.length) throw new Error("missing_payfast_session_data");

  const complete = await store(`/carts/${cartId}/complete`, { method: "POST", body: "{}" });
  const orderId = complete.order?.id ?? complete.data?.id;
  if (!orderId) throw new Error("order_complete_no_id");

  return { orderId, cartId, payfast: data };
}

/**
 * @param {{ action: string, fields: [string, string][] }} payfast
 */
async function payfastWalletWithFetch(payfast) {
  const jar = new CookieJar();
  const form = new URLSearchParams();
  for (const [k, v] of payfast.fields) form.set(k, v);

  const checkoutPost = await fetchWithJar(jar, payfast.action, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });
  const paymentUrl = checkoutPost.headers.get("location");
  if (!paymentUrl) throw new Error("payfast_no_redirect");

  const payPageRes = await fetchWithJar(jar, paymentUrl);
  const payHtml = await payPageRes.text();
  const uuid = metaContent(payHtml, "uuid");
  if (!uuid) throw new Error("payfast_missing_uuid");

  await fetchWithJar(jar, "https://sandbox.payfast.co.za/sanctum/csrf-cookie");
  const xsrf = jar.get("XSRF-TOKEN");
  const csrf = metaContent(payHtml, "csrf-token") ?? "";
  const username =
    (payHtml.match(/id="username"[^>]*value="([^"]+)"/i) ??
      payHtml.match(/name="username"[^>]*value="([^"]+)"/i) ??
      [])[1] ?? "sbtu01@payfast.co.za";

  const jsonHeaders = {
    Accept: "application/json",
    ...(xsrf ? { "X-XSRF-TOKEN": xsrf } : {}),
    ...(csrf ? { "X-CSRF-TOKEN": csrf } : {}),
  };

  let loginStatus = "skipped";
  let loginOk = false;
  const loginRes = await fetchWithJar(jar, `https://sandbox.payfast.co.za/eng/buyer/${uuid}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      ...jsonHeaders,
    },
    body: new URLSearchParams({ username, password: "clientpass" }).toString(),
  });
  loginStatus = String(loginRes.status);
  if (loginRes.ok) {
    loginOk = true;
  }

  const socketStages = [];
  let socketSkipped = false;
  /** @type {import('socket.io-client').Socket | null} */
  let socket = null;
  try {
    socket = io("https://sandbox.payfast.co.za/", {
      path: "/comms",
      reconnectionAttempts: 2,
      timeout: 8_000,
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("payfast_socket_connect_timeout")), 12_000);
      socket.on("connect", () => {
        socket.emit("idRegister", uuid);
        clearTimeout(timer);
        resolve(undefined);
      });
      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    socket.on("message", (payload) => {
      if (payload?.event === "progress" && payload?.data?.stage) {
        socketStages.push(payload.data.stage);
      }
    });
  } catch {
    socketSkipped = true;
  }

  await fetchWithJar(jar, `https://sandbox.payfast.co.za/eng/method/WalletFunds/${uuid}/select`, {
    method: "POST",
    headers: jsonHeaders,
    body: "",
  });

  const walletRes = await fetchWithJar(jar, `https://sandbox.payfast.co.za/eng/method/WalletFunds/${uuid}/pay`, {
    method: "POST",
    headers: jsonHeaders,
    body: "",
  });
  const walletBody = await walletRes.text();
  let walletPaid = false;
  try {
    const parsed = JSON.parse(walletBody);
    walletPaid = Array.isArray(parsed) && parsed[0] === true;
  } catch {
    walletPaid = walletRes.ok && /true/.test(walletBody);
  }

  await new Promise((resolve) => {
    const deadline = Date.now() + 30_000;
    const tick = () => {
      if (socketStages.includes("finished") || Date.now() > deadline) {
        socket?.close?.();
        resolve(undefined);
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
  if (socketSkipped && !socketStages.includes("finished")) {
    await new Promise((r) => setTimeout(r, 4_000));
  }

  const finishRes = await fetchWithJar(jar, `https://sandbox.payfast.co.za/eng/process/finish/${uuid}`);
  const finishHtml = await finishRes.text();
  const returnUrl = jsRedirectUrl(finishHtml);

  let returnStatus = null;
  let returnPaidHint = false;
  if (returnUrl) {
    const ret = await fetchReturnPage(returnUrl);
    returnStatus = ret.status;
    const retHtml = await ret.text();
    returnPaidHint = /thank you|payment successful|order confirmed/i.test(retHtml);
  }

  return {
    paymentUrlHost: new URL(paymentUrl).host,
    uuid,
    loginStatus,
    loginOk,
    walletHttpStatus: walletRes.status,
    walletPaid,
    socketStages,
    payfastFinished: socketStages.includes("finished") || walletPaid,
    socketSkipped,
    finishStatus: finishRes.status,
    returnUrlHost: returnUrl ? new URL(returnUrl).host : null,
    returnStatus,
    returnPaidHint,
  };
}

async function main() {
  PK = await resolvePublishableKey();
  console.log(JSON.stringify({ step: "publishable_key_resolved", backendHost: new URL(API).host }));

  const existingOrder = process.env.EXISTING_ORDER_ID?.trim();
  let orderId = existingOrder;
  let payfast;

  if (process.env.PAYFAST_SESSION_JSON) {
    payfast = JSON.parse(process.env.PAYFAST_SESSION_JSON);
    console.log(JSON.stringify({ step: "using_saved_payfast_session", orderId: orderId ?? null }));
  } else {
    console.log(JSON.stringify({ step: "creating_order", backendHost: new URL(API).host }));
    const created = await createOrderAndPayfastSession();
    orderId = created.orderId;
    payfast = created.payfast;
    console.log(JSON.stringify({ step: "order_created", orderId, cartId: created.cartId }));
  }

  if (!payfast?.action || !payfast?.fields?.length) {
    throw new Error("no_payfast_session — create a new order or set PAYFAST_SESSION_JSON");
  }

  const pf = await payfastWalletWithFetch(payfast);
  console.log(
    JSON.stringify({
      step: "payfast_fetch_complete",
      orderId,
      ...pf,
      approach: "fetch_cookie_jar",
      loginRequiredForWallet: pf.loginOk,
      success: pf.walletPaid && !!pf.returnUrlHost,
    }),
  );

  if (!pf.walletPaid) process.exit(2);

  const mPaymentId = payfast.fields?.find(([k]) => k === "m_payment_id")?.[1];
  if (mPaymentId) {
    const recRes = await fetch(`${API}/store/payfast/reconcile`, {
      method: "POST",
      headers: storeHeaders(),
      body: JSON.stringify({ ref: mPaymentId }),
    });
    const recBody = await recRes.json().catch(() => ({}));
    console.log(
      JSON.stringify({
        step: "payfast_reconcile",
        httpStatus: recRes.status,
        ...recBody,
      }),
    );
  }

  const pollDeadline = Date.now() + 120_000;
  let paymentStatus = "unknown";
  let captured = false;
  while (Date.now() < pollDeadline) {
    const order = await store(`/orders/${orderId}`);
    paymentStatus = order.order?.payment_status ?? order.payment_status ?? "unknown";
    const payments = order.order?.payment_collections?.[0]?.payments ?? order.payments ?? [];
    captured =
      paymentStatus === "captured" ||
      payments.some((p) => p.captured_at || p.captured_amount > 0);
    if (captured) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log(
    JSON.stringify({
      step: "order_poll",
      orderId,
      paymentStatus,
      captured,
      success: captured,
    }),
  );
  if (!captured) process.exit(3);
}

main().catch((e) => {
  const cause = e?.cause?.message ?? e?.cause?.code;
  console.error(JSON.stringify({ error: e.message, cause: cause ?? undefined }));
  process.exit(1);
});
