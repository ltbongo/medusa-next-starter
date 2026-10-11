// Server-only PayFast configuration for Medusa backend.
export type PayfastMode = "sandbox" | "live";

export interface PayfastConfig {
  mode: PayfastMode;
  merchantId: string;
  merchantKey: string;
  passphrase: string | null;
  /** Storefront origin (return/cancel pages). */
  siteUrl: string;
  /** Medusa API origin for PayFast ITN (`/hooks/payfast/itn`). */
  backendUrl: string;
}

export const PAYFAST_HOSTS: Record<PayfastMode, string> = {
  sandbox: "sandbox.payfast.co.za",
  live: "www.payfast.co.za",
};

export const PAYFAST_API_BASE = "https://api.payfast.co.za";

export const processUrl = (c: PayfastConfig) =>
  `https://${PAYFAST_HOSTS[c.mode]}/eng/process`;

/** PayFast Onsite process endpoint (same host as standard process). */
export const onsiteProcessUrl = processUrl;
export const validateUrl = (c: PayfastConfig) =>
  `https://${PAYFAST_HOSTS[c.mode]}/eng/query/validate`;

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

let cached: PayfastConfig | null = null;

function resolvePayfastMode(): PayfastMode {
  const sandboxFlag = process.env.PAYFAST_SANDBOX?.trim().toLowerCase();
  if (sandboxFlag === "true" || sandboxFlag === "1") return "sandbox";
  if (sandboxFlag === "false" || sandboxFlag === "0") return "live";
  const modeRaw = (process.env.PAYFAST_MODE ?? "sandbox").trim();
  if (modeRaw !== "sandbox" && modeRaw !== "live") {
    throw new Error(
      "PAYFAST_SANDBOX must be true/false or PAYFAST_MODE must be 'sandbox' or 'live'"
    );
  }
  return modeRaw;
}

export function getPayfastConfig(): PayfastConfig {
  if (cached) return cached;
  const modeRaw = resolvePayfastMode();
  const siteUrl = required("SITE_URL").replace(/\/+$/, "");
  if (!siteUrl.startsWith("https://")) {
    throw new Error("SITE_URL must be https://");
  }
  const backendUrl = (
    process.env.MEDUSA_BACKEND_URL ??
    process.env.MEDUSA_PUBLIC_URL ??
    "http://localhost:9000"
  )
    .trim()
    .replace(/\/+$/, "");
  const merchantId = required("PAYFAST_MERCHANT_ID");
  if (!/^\d+$/.test(merchantId)) {
    throw new Error("PAYFAST_MERCHANT_ID must be numeric");
  }
  const passphrase = process.env.PAYFAST_PASSPHRASE?.trim() || null;
  if (modeRaw === "live" && !passphrase) {
    throw new Error("PAYFAST_PASSPHRASE is required in live mode");
  }
  cached = {
    mode: modeRaw,
    merchantId,
    merchantKey: required("PAYFAST_MERCHANT_KEY"),
    passphrase,
    siteUrl,
    backendUrl,
  };
  return cached;
}

export function payfastNotifyUrl(cfg: PayfastConfig): string {
  const base = cfg.backendUrl.startsWith("http")
    ? cfg.backendUrl
    : `https://${cfg.backendUrl}`;
  return `${base}/hooks/payfast/itn`;
}
