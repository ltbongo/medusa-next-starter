// lib/payfast/money.ts — always keep money as integer CENTS internally. PayFast wants:
//  - checkout `amount` / `recurring_amount`: decimal rand string "123.45" (ZAR)
//  - ITN `amount_gross`: decimal rand string
//  - REST API amounts (adhoc, update, refunds) and split payments: integer CENTS
export function centsToRand(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("amount must be a non-negative integer number of cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** Parse "200.00" / "-4.60" from an ITN into cents without float drift. */
export function randToCents(rand: string): number {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(rand.trim());
  if (!m) throw new Error(`Not a rand amount: ${rand}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

/** Docs (Going Live): payments below ZAR 5.00 can't be processed; subscription recurring_amount minimum is 5.00. */
export const MIN_AMOUNT_CENTS = 500;
