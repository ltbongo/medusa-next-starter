// lib/payfast/itn.ts — Instant Transaction Notification (ITN) security checks.
// Docs "Step 4: Confirm payment": return 200 to stop retries; then FOUR checks, and don't continue if any fails:
//   1) signature  2) source is PayFast  3) amount_gross matches what you expected  4) server confirmation (validate)
import { lookup } from "node:dns/promises";
import { formDecode } from "./encoding";
import { itnParamString, itnSignature, sameSignature } from "./signature";
import { randToCents } from "./money";

export type ItnPairs = Array<[string, string]>;

/** Parse the RAW x-www-form-urlencoded body, preserving PayFast's field order (needed for the signature). */
export function parseItnBody(raw: string): ItnPairs {
  if (!raw) return [];
  return raw.split("&").filter(Boolean).map((part) => {
    const i = part.indexOf("=");
    const k = i === -1 ? part : part.slice(0, i);
    const v = i === -1 ? "" : part.slice(i + 1);
    return [formDecode(k), formDecode(v)] as [string, string];
  });
}

export function verifyItnSignature(pairs: ItnPairs, passphrase: string | null): { ok: boolean; paramString: string } {
  const paramString = itnParamString(pairs);
  const posted = pairs.find(([k]) => k === "signature")?.[1];
  return { ok: sameSignature(posted, itnSignature(paramString, passphrase)), paramString };
}

// ---- Check 2: source ----------------------------------------------------------------------------
/** Docs "Ports and IP addresses" (updated list, checked 2026-10-08). Re-check the docs before go-live. */
export const PAYFAST_IP_RANGES = [
  "197.97.145.144/28",
  "41.74.179.192/27",
  "102.216.36.0/28",
  "102.216.36.128/28",
  "144.126.193.139/32",
];
/** Docs "valid domains" list; the docs' sample check resolves these and compares the caller IP. */
export const PAYFAST_VALID_HOSTS = ["www.payfast.co.za", "w1w.payfast.co.za", "w2w.payfast.co.za", "sandbox.payfast.co.za"];

const ipv4ToInt = (ip: string) => ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const normaliseIp = (ip: string) => ip.trim().replace(/^::ffff:/i, "");

let dnsCache: { at: number; ips: Set<string> } | null = null;
async function resolvedPayfastIps(): Promise<Set<string>> {
  if (dnsCache && Date.now() - dnsCache.at < 10 * 60_000) return dnsCache.ips;
  const ips = new Set<string>();
  await Promise.all(
    PAYFAST_VALID_HOSTS.map(async (h) => {
      try {
        for (const a of await lookup(h, { all: true })) ips.add(normaliseIp(a.address));
      } catch { /* a host failing to resolve must not break the others */ }
    }),
  );
  dnsCache = { at: Date.now(), ips };
  return ips;
}

export async function isPayfastSourceIp(ipRaw: string | null): Promise<boolean> {
  if (!ipRaw) return false;
  const ip = normaliseIp(ipRaw);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && PAYFAST_IP_RANGES.some((c) => inCidr(ip, c))) return true;
  return (await resolvedPayfastIps()).has(ip);
}

/**
 * Caller IP behind our proxy. Dokploy apps sit behind Traefik, which sets X-Real-Ip / X-Forwarded-For.
 * If a CDN (e.g. Cloudflare proxy) is in front, the header must change (set PAYFAST_CLIENT_IP_HEADER).
 * Confirm on the FIRST sandbox ITN by logging the observed IP (never log the body or secrets).
 */
const isPrivateOrLoopback = (ip: string) => {
  const n = ipv4ToInt(ip);
  if (ip === "127.0.0.1" || ip.startsWith("127.")) return true;
  if ((n & 0xff000000) === 0x0a000000) return true; // 10.0.0.0/8
  if ((n & 0xfff00000) === 0xac100000) return true; // 172.16.0.0/12
  if ((n & 0xffff0000) === 0xc0a80000) return true; // 192.168.0.0/16
  return false;
};

export function callerIp(headers: Headers): string | null {
  const name = (process.env.PAYFAST_CLIENT_IP_HEADER || "x-real-ip").toLowerCase();
  const direct = headers.get(name);
  const xff = headers.get("x-forwarded-for");
  const xffClient = xff
    ? xff.split(",").map((s) => s.trim()).filter(Boolean)[0] ?? null
    : null;
  if (direct) {
    const ip = direct.split(",")[0].trim();
    // Dokploy/Traefik sometimes sets x-real-ip to the internal hop; prefer the public client in XFF.
    if (!isPrivateOrLoopback(ip)) return ip;
    if (xffClient && !isPrivateOrLoopback(xffClient)) return xffClient;
    return ip;
  }
  return xffClient;
}

// ---- Check 3: amount ----------------------------------------------------------------------------
/** Docs compare with a 0.01 tolerance; we compare exact integer cents (stricter, no float drift). */
export function amountMatches(expectedCents: number, amountGross: string | undefined): boolean {
  if (amountGross === undefined || amountGross === "") return false;
  try { return randToCents(amountGross) === expectedCents; } catch { return false; }
}

// ---- Check 4: server confirmation -----------------------------------------------------------------
export type ValidateResult = "VALID" | "INVALID" | "ERROR";
/**
 * POST the param string (WITHOUT signature and WITHOUT passphrase) to /eng/query/validate.
 * PayFast answers the text "VALID" (PayFast's own plugins read the first line, case-insensitive, 15s timeout).
 * Observed 2026-10-08: sandbox answers "INVALID" for data it didn't send.
 */
export async function validateWithPayfast(validateUrl: string, paramString: string): Promise<ValidateResult> {
  try {
    const res = await fetch(validateUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: paramString,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return "ERROR";
    const first = (await res.text()).split("\n")[0].trim().toUpperCase();
    return first === "VALID" ? "VALID" : "INVALID";
  } catch {
    return "ERROR";
  }
}

/** Documented payment_status values: COMPLETE, CANCELLED (subscription cancelled).
 *  PayFast's own plugins also handle FAILED, and treat anything else (e.g. pending) as "no change". */
export type ItnStatus = "COMPLETE" | "CANCELLED" | "FAILED" | (string & {});
