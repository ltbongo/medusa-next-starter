import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * Sandbox return-path reconciliation when PayFast wallet ITN is missing or delayed.
 * POST { "ref": "<m_payment_id from return URL>" }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ref = (req.body as { ref?: string })?.ref?.trim();
  if (!ref) {
    res.status(400).json({ ok: false, reason: "ref_required" });
    return;
  }
  try {
    const { reconcilePayfastReturn } = await import(
      "../../../../lib/payfast/reconcile-return"
    );
    const result = await reconcilePayfastReturn(req.scope, ref);
    res.status(result.ok ? 200 : 404).json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      reason: "reconcile_failed",
      message: (err as Error).message,
    });
  }
}
