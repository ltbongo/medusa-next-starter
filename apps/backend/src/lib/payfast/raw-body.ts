/** Normalise Medusa `req.rawBody` for PayFast ITN signature verification. */
export function rawItnBodyString(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof Uint8Array) return Buffer.from(raw).toString("utf8");
  if (
    typeof raw === "object" &&
    raw !== null &&
    "type" in raw &&
    (raw as { type: string }).type === "Buffer" &&
    Array.isArray((raw as unknown as { data: number[] }).data)
  ) {
    return Buffer.from((raw as unknown as { data: number[] }).data).toString(
      "utf8"
    );
  }
  return "";
}
