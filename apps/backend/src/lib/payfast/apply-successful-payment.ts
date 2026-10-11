import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { MedusaError } from "@medusajs/utils";

/**
 * Authorize + capture a PayFast session after `payment_status: COMPLETE` is stored on the session.
 * Used when process-payment-workflow leaves deferred sessions pending (common for wallet + existing orders).
 */
export async function applyPayfastSuccessfulPayment(
  scope: MedusaContainer,
  sessionId: string,
  amount: number
): Promise<void> {
  const paymentService = scope.resolve(Modules.PAYMENT);

  let payment = await paymentService.authorizePaymentSession(sessionId, {});
  if (!payment?.id) {
    const session = await paymentService.retrievePaymentSession(sessionId, {
      relations: ["payment"],
    });
    if (session.payment?.id) {
      payment = session.payment;
    }
  }

  if (!payment?.id) {
    throw new MedusaError(
      MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
      `PayFast session ${sessionId} was not authorized`
    );
  }

  if (!payment.captured_at) {
    await paymentService.capturePayment({
      payment_id: payment.id,
      amount,
    });
  }
}
