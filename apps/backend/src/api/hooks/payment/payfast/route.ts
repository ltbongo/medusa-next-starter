import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { handlePayfastItn } from "../../payfast/handle-itn";

/**
 * Medusa registers provider webhooks at `/hooks/payment/{provider_id}`.
 * PayFast sandbox ITN hits this path; use the same synchronous handler as `/hooks/payfast/itn`.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return handlePayfastItn(req, res);
}

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.status(405).send("Method Not Allowed");
}
