import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { processPaymentWorkflowId } from "@medusajs/core-flows";
import {
  ContainerRegistrationKeys,
  Modules,
  PaymentActions,
} from "@medusajs/framework/utils";

function normalizeRawBody(raw: unknown): string | Buffer | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string" || Buffer.isBuffer(raw)) return raw;
  return undefined;
}

function bodyToRecord(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

/**
 * PayFast ITN handler (notify_url). Runs payment workflow synchronously.
 * Mounted at `/hooks/payfast/itn` and `/hooks/payment/payfast` (Medusa default webhook path).
 */
export async function handlePayfastItn(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    const paymentService = req.scope.resolve(Modules.PAYMENT);
    const rawData = normalizeRawBody(req.rawBody) ?? "";
    const processedEvent = await paymentService.getWebhookActionAndData({
      provider: "payfast",
      payload: {
        data: bodyToRecord(req.body),
        rawData,
        headers: req.headers as Record<string, unknown>,
      },
    });

    if (!processedEvent.data?.session_id) {
      res.sendStatus(200);
      return;
    }

    const skip =
      processedEvent.action === PaymentActions.NOT_SUPPORTED ||
      processedEvent.action === PaymentActions.CANCELED ||
      processedEvent.action === PaymentActions.FAILED ||
      processedEvent.action === PaymentActions.REQUIRES_MORE ||
      processedEvent.action === PaymentActions.PENDING_AUTHORIZATION ||
      processedEvent.action === PaymentActions.PENDING;

    if (skip) {
      res.sendStatus(200);
      return;
    }

    if (
      processedEvent.action === PaymentActions.SUCCESSFUL &&
      processedEvent.data?.session_id
    ) {
      const sessionId = processedEvent.data.session_id;
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: sessions } = await query.graph({
        entity: "payment_session",
        fields: ["id", "data"],
        filters: { id: sessionId },
      });
      const prev = (sessions?.[0]?.data ?? {}) as Record<string, unknown>;
      const itn = bodyToRecord(req.body);
      await paymentService.updatePaymentSession({
        id: sessionId,
        data: {
          ...prev,
          payment_status: "COMPLETE",
          ...(itn.pf_payment_id != null && itn.pf_payment_id !== ""
            ? { pf_payment_id: String(itn.pf_payment_id) }
            : {}),
        },
      });
    }

    const wfEngine = req.scope.resolve(Modules.WORKFLOW_ENGINE);
    await wfEngine.run(processPaymentWorkflowId, { input: processedEvent });
    res.sendStatus(200);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  }
}
