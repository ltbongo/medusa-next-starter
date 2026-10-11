import { randomUUID } from "node:crypto";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import { buildCheckoutFields } from "../../lib/payfast/checkout";
import {
  getPayfastConfig,
  payfastNotifyUrl,
  processUrl,
  validateUrl,
} from "../../lib/payfast/config";
import {
  amountMatches,
  callerIp,
  isPayfastSourceIp,
  parseItnBody,
  validateWithPayfast,
  verifyItnSignature,
} from "../../lib/payfast/itn";
import { randToCents } from "../../lib/payfast/money";
import {
  centsToMedusaAmount,
  medusaAmountToCents,
} from "../../lib/payfast/medusa-amount";
import { rawItnBodyString } from "../../lib/payfast/raw-body";

type PayfastSessionData = {
  session_id: string;
  m_payment_id: string;
  amount_cents: number;
  currency_code: string;
  action: string;
  fields: Array<[string, string]>;
  pf_payment_id?: string;
  payment_status?: string;
};

type PayfastProviderOptions = Record<string, never>;

function pairsToRecord(pairs: Array<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of pairs) out[k] = v;
  return out;
}

function toFetchHeaders(
  headers: Record<string, unknown> | undefined
): Headers {
  const h = new Headers();
  if (!headers) return h;
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") h.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === "string") {
      h.set(key, value[0]);
    }
  }
  return h;
}

export default class PayfastProviderService extends AbstractPaymentProvider<PayfastProviderOptions> {
  static identifier = "payfast";

  constructor(
    cradle: Record<string, unknown>,
    options: PayfastProviderOptions
  ) {
    super(cradle, options);
  }

  async initiatePayment({
    amount,
    currency_code,
    data,
    context,
  }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const cfg = getPayfastConfig();
    const sessionId =
      (data?.session_id as string | undefined) ??
      context?.idempotency_key ??
      randomUUID();
    const amountCents = medusaAmountToCents(amount, currency_code);
    const mPaymentId = `med-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
    const customer = context?.customer;
    const email = customer?.email?.trim();
    const name = [customer?.first_name, customer?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const space = name.indexOf(" ");
    const { fields } = buildCheckoutFields(cfg, {
      mPaymentId,
      amountCents,
      itemName: `Order ${mPaymentId}`,
      buyer: {
        nameFirst: space > 0 ? name.slice(0, space) : name || undefined,
        nameLast: space > 0 ? name.slice(space + 1).trim() : undefined,
        email: email || undefined,
        cell: customer?.phone?.trim() || undefined,
      },
      returnUrl: `${cfg.siteUrl}/checkout/return?ref=${encodeURIComponent(mPaymentId)}`,
      cancelUrl: `${cfg.siteUrl}/checkout/cancel?ref=${encodeURIComponent(mPaymentId)}`,
      notifyUrl: payfastNotifyUrl(cfg),
      customStr: { 1: sessionId },
      customInt: { 1: amountCents },
    });

    const sessionData: PayfastSessionData = {
      session_id: sessionId,
      m_payment_id: mPaymentId,
      amount_cents: amountCents,
      currency_code: currency_code.toLowerCase(),
      action: processUrl(cfg),
      fields,
    };

    return {
      id: mPaymentId,
      status: PaymentSessionStatus.PENDING,
      data: sessionData,
    };
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as PayfastSessionData;
    if (data.payment_status === "COMPLETE") {
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data,
      };
    }
    return {
      status: PaymentSessionStatus.PENDING_AUTHORIZATION,
      data,
    };
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as PayfastSessionData;
    if (data.payment_status === "COMPLETE") {
      return {
        status: PaymentSessionStatus.CAPTURED,
        data,
      };
    }
    return {
      status: PaymentSessionStatus.PENDING,
      data,
    };
  }

  async capturePayment({
    data,
  }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: data ?? {} };
  }

  async cancelPayment({ data }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: data ?? {} };
  }

  async deletePayment({ data }: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: data ?? {} };
  }

  async refundPayment({ data }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw this.buildError(
      "PayFast refunds are not implemented in this provider",
      new Error("not_supported")
    );
  }

  async retrievePayment({
    data,
  }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: data ?? {} };
  }

  async updatePayment({
    amount,
    currency_code,
    data,
    context,
  }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const prev = (data ?? {}) as PayfastSessionData;
    if (prev.payment_status === "COMPLETE") {
      return {
        data: prev,
        status: PaymentSessionStatus.AUTHORIZED,
      };
    }
    if (!amount || !currency_code) {
      return { data: prev };
    }
    const initiated = await this.initiatePayment({
      amount,
      currency_code,
      data,
      context,
    });
    return { data: initiated.data, status: initiated.status };
  }

  async getWebhookActionAndData(
    webhookData: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const cfg = getPayfastConfig();
    const raw = rawItnBodyString(webhookData.rawData);
    const pairs =
      raw.length > 0
        ? parseItnBody(raw)
        : Object.entries(
            (webhookData.data ?? {}) as Record<string, string>
          ).map(([k, v]) => [k, String(v)] as [string, string]);

    if (!pairs.length) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const { ok: sigOk, paramString } = verifyItnSignature(
      pairs,
      cfg.passphrase
    );
    if (!sigOk) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const record = pairsToRecord(pairs);
    const headers = toFetchHeaders(
      webhookData.headers as Record<string, unknown>
    );
    const sourceIp = callerIp(headers);
    const ipOk =
      cfg.mode === "sandbox"
        ? true
        : await isPayfastSourceIp(sourceIp);
    if (!ipOk) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    if (record.merchant_id && record.merchant_id !== cfg.merchantId) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const sessionId = record.custom_str1?.trim();
    if (!sessionId) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const expectedCents = record.custom_int1
      ? Number.parseInt(record.custom_int1, 10)
      : NaN;
    if (
      Number.isInteger(expectedCents) &&
      !amountMatches(expectedCents, record.amount_gross)
    ) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const validateResult = await validateWithPayfast(
      validateUrl(cfg),
      paramString
    );
    if (validateResult !== "VALID") {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const status = (record.payment_status ?? "").toUpperCase();
    const amountGross = record.amount_gross;

    const webhookAmount = Number.isInteger(expectedCents)
      ? centsToMedusaAmount(expectedCents)
      : amountGross
        ? centsToMedusaAmount(randToCents(amountGross))
        : 0;

    if (status === "COMPLETE") {
      return {
        action: PaymentActions.SUCCESSFUL,
        data: {
          session_id: sessionId,
          amount: webhookAmount,
        },
      };
    }

    if (status === "CANCELLED") {
      return {
        action: PaymentActions.CANCELED,
        data: { session_id: sessionId, amount: webhookAmount },
      };
    }

    if (status === "FAILED") {
      return {
        action: PaymentActions.FAILED,
        data: { session_id: sessionId, amount: webhookAmount },
      };
    }

    return { action: PaymentActions.NOT_SUPPORTED };
  }

  private buildError(message: string, error: Error): Error {
    return new Error(`${message}: ${error.message}`);
  }
}
