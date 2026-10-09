/**
 * B9 demo seed helper — runs after `medusa db:migrate` on a fresh database.
 * The migration script `initial-data-seed` creates regions, fulfilment, and 12 ZAR products.
 * This script prints the publishable API key token for local storefront setup.
 *
 *   npm run seed
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function seedDemo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

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
