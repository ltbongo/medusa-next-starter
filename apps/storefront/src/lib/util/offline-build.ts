/** When set, Next build skips Medusa-backed static path generation (CI / Docker build without backend). */
export function isOfflineStorefrontBuild(): boolean {
  return process.env.B9_STOREFRONT_OFFLINE_BUILD === "1"
}
