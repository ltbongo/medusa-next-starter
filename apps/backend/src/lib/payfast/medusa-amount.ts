import type { BigNumberInput } from "@medusajs/framework/types";
import { MathBN } from "@medusajs/framework/utils";

/**
 * Medusa payment/cart totals for ZAR are minor units (cents) in this project — same as variant prices.
 * PayFast checkout and ITN also use integer cents internally.
 */
export function medusaAmountToCents(
  amount: BigNumberInput,
  currencyCode: string
): number {
  const code = currencyCode.toUpperCase();
  if (code !== "ZAR") {
    throw new Error(`PayFast provider supports ZAR only (got ${code})`);
  }
  const asInt = Number(MathBN.convert(MathBN.convert(amount)));
  if (!Number.isInteger(asInt) || asInt < 0) {
    throw new Error("Invalid payment amount");
  }
  return asInt;
}

/** Medusa capture/webhook amounts stay in minor units (cents). */
export function centsToMedusaAmount(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("Invalid cents value");
  }
  return cents;
}
