import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { applyPayfastSuccessfulPayment } from "./apply-successful-payment";
import { historyRange } from "./api";
import { getPayfastConfig } from "./config";
import { centsToMedusaAmount } from "./medusa-amount";

export function sessionIdFromMPaymentId(mPaymentId: string): string | null {
  if (!mPaymentId.startsWith("med-")) return null;
  const sessionId = mPaymentId.slice(4);
  return sessionId.startsWith("payses_") ? sessionId : null;
}

function historyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object" && "data" in body) {
    const data = (body as { data: unknown }).data;
    if (typeof data === "string") return data;
    if (data != null) return JSON.stringify(data);
  }
  return body == null ? "" : JSON.stringify(body);
}

/** Sandbox fallback when PayFast wallet ITN is delayed or missing on notify_url. */
export async function reconcilePayfastReturn(
  scope: MedusaContainer,
  mPaymentId: string
): Promise<{ ok: boolean; reason?: string; sessionId?: string }> {
  const cfg = getPayfastConfig();
  if (cfg.mode !== "sandbox") {
    return { ok: false, reason: "reconcile_sandbox_only" };
  }

  const sessionId = sessionIdFromMPaymentId(mPaymentId);
  if (!sessionId) return { ok: false, reason: "invalid_ref" };

  const today = new Date().toISOString().slice(0, 10);
  const history = await historyRange({ from: today, to: today, limit: 200 });
  if (history.httpStatus !== 200) {
    return { ok: false, reason: "history_http_error" };
  }

  const text = historyText(history.body);
  if (!text.includes(mPaymentId)) {
    return { ok: false, reason: "not_in_history" };
  }

  const row = text.split(/\r?\n/).find((line) => line.includes(mPaymentId));
  if (!row) {
    return { ok: false, reason: "payment_not_complete" };
  }

  const pfPaymentId =
    row.match(/(?:^|,|\t)"?(\d{6,})"?/)?.[1] ??
    text.match(new RegExp(`${mPaymentId}[^0-9]{0,40}(\\d{6,})`))?.[1];

  const paymentService = scope.resolve(Modules.PAYMENT);
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: sessions } = await query.graph({
    entity: "payment_session",
    fields: ["id", "amount", "currency_code", "data"],
    filters: { id: sessionId },
  });
  const session = sessions?.[0];
  if (!session?.id) return { ok: false, reason: "session_not_found" };

  const prev = (session.data ?? {}) as Record<string, unknown>;
  const amountCents =
    typeof prev.amount_cents === "number" ? prev.amount_cents : undefined;
  if (amountCents == null) return { ok: false, reason: "missing_amount_cents" };

  const dataPatch = {
    ...prev,
    payment_status: "COMPLETE",
    ...(pfPaymentId ? { pf_payment_id: pfPaymentId } : {}),
  };

  const currency_code =
    (typeof session.currency_code === "string" && session.currency_code) ||
    (typeof prev.currency_code === "string" ? prev.currency_code : "zar");
  const sessionAmount =
    typeof session.amount === "number"
      ? session.amount
      : centsToMedusaAmount(amountCents);

  await paymentService.updatePaymentSession({
    id: sessionId,
    amount: sessionAmount,
    currency_code,
    data: dataPatch,
  });

  await applyPayfastSuccessfulPayment(
    scope,
    sessionId,
    centsToMedusaAmount(amountCents)
  );

  return { ok: true, sessionId };
}
