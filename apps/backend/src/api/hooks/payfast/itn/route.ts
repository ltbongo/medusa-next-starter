import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { handlePayfastItn } from "../handle-itn";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return handlePayfastItn(req, res);
}

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.status(405).send("Method Not Allowed");
}
