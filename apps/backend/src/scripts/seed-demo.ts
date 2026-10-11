/**
 * B9 demo seed helper — runs after `medusa db:migrate` on a fresh database.
 * The migration script `initial-data-seed` creates regions, fulfilment, and 12 ZAR products.
 * This script ensures PayFast is enabled on the South Africa region (idempotent) and prints
 * the publishable API key token for local storefront setup.
 *
 *   npm run seed
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

const ZA_COUNTRY = "za"
const PAYFAST_PROVIDER_ID = "pp_payfast"

export default async function seedDemo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: regions } = await query.graph({
    entity: "region",
    fields: [
      "id",
      "name",
      "currency_code",
      "countries.iso_2",
      "payment_providers.id",
    ],
  })

  const zaRegion =
    regions.find((region) =>
      region.countries?.some(
        (country) => country?.iso_2?.toLowerCase() === ZA_COUNTRY
      )
    ) ??
    regions.find((region) => region.currency_code?.toLowerCase() === "zar")

  if (zaRegion) {
    const currentIds =
      zaRegion.payment_providers?.map((p) => p?.id).filter(Boolean) ?? []

    const paymentProviders = currentIds.includes(PAYFAST_PROVIDER_ID)
      ? currentIds
      : [...currentIds, PAYFAST_PROVIDER_ID]

    if (!currentIds.includes(PAYFAST_PROVIDER_ID)) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: zaRegion.id },
          update: {
            payment_providers: paymentProviders as string[],
          },
        },
      })
      logger.info(
        `Enabled ${PAYFAST_PROVIDER_ID} on region "${zaRegion.name}" (${ZA_COUNTRY.toUpperCase()}).`
      )
    }

    logger.info(
      `South Africa region payment providers: ${paymentProviders.join(", ")}`
    )
  } else {
    logger.warn(
      `No region with country ${ZA_COUNTRY.toUpperCase()} found; skipped PayFast provider link.`
    )
  }

  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "type", "token"],
    filters: { type: "publishable" },
  })

  const publishable = apiKeys[0]

  if (!publishable?.token) {
    logger.warn(
      "No publishable API key found. Open Medusa admin → Settings → Publishable API Keys."
    )
    return
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id"],
  })

  logger.info(
    `Demo seed complete: ${products.length} product(s) in the catalogue.`
  )
  logger.info(
    "Copy this publishable API key into apps/storefront/.env.local as NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:"
  )
  logger.info(publishable.token)
}
