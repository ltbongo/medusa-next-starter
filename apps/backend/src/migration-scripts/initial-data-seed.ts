import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

const COUNTRY_CODE = "za"
const CURRENCY_CODE = "zar"

const DEMO_PRODUCTS = [
  {
    title: "Everyday Cotton Tee",
    handle: "demo-everyday-cotton-tee",
    amount: 29900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
  },
  {
    title: "Classic Linen Shirt",
    handle: "demo-classic-linen-shirt",
    amount: 44900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
  },
  {
    title: "Relaxed Fit Hoodie",
    handle: "demo-relaxed-fit-hoodie",
    amount: 59900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
  },
  {
    title: "Weekend Sweatshirt",
    handle: "demo-weekend-sweatshirt",
    amount: 54900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
  },
  {
    title: "Comfort Joggers",
    handle: "demo-comfort-joggers",
    amount: 49900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png",
  },
  {
    title: "Summer Chino Shorts",
    handle: "demo-summer-chino-shorts",
    amount: 39900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
  },
  {
    title: "Heritage Denim Jacket",
    handle: "demo-heritage-denim-jacket",
    amount: 89900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
  },
  {
    title: "Lightweight Windbreaker",
    handle: "demo-lightweight-windbreaker",
    amount: 74900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
  },
  {
    title: "Essential Beanie",
    handle: "demo-essential-beanie",
    amount: 19900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/coffee-mug.png",
  },
  {
    title: "Canvas Tote Bag",
    handle: "demo-canvas-tote-bag",
    amount: 24900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/coffee-mug.png",
  },
  {
    title: "Performance Socks (3-pack)",
    handle: "demo-performance-socks",
    amount: 14900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/coffee-mug.png",
  },
  {
    title: "Studio Cap",
    handle: "demo-studio-cap",
    amount: 22900,
    image:
      "https://medusa-public-images.s3.eu-west-1.amazonaws.com/coffee-mug.png",
  },
]

export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  )

  logger.info("Seeding B9 demo store (South Africa / ZAR)...")

  const {
    result: [defaultSalesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        {
          name: "South Africa Storefront",
          description: "B9 demo sales channel",
        },
      ],
    },
  })

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Storefront Publishable Key",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  })

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel.id],
    },
  })

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "B9 Demo Store",
          supported_currencies: [
            {
              currency_code: CURRENCY_CODE,
              is_default: true,
            },
          ],
          default_sales_channel_id: defaultSalesChannel.id,
        },
      ],
    },
  })

  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "South Africa",
          currency_code: CURRENCY_CODE,
          countries: [COUNTRY_CODE],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  })
  const region = regionResult[0]

  await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: COUNTRY_CODE,
        provider_id: "tp_system",
      },
    ],
  })

  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Cape Town Warehouse",
          address: {
            city: "Cape Town",
            country_code: COUNTRY_CODE.toUpperCase(),
            address_1: "Demo fulfilment centre",
          },
        },
      ],
    },
  })
  const stockLocation = stockLocationResult[0]

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  })

  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfileResult[0]

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "South Africa delivery",
    type: "shipping",
    service_zones: [
      {
        name: "South Africa",
        geo_zones: [
          {
            country_code: COUNTRY_CODE,
            type: "country",
          },
        ],
      },
    ],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  })

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Ship in 3-5 business days.",
          code: "standard",
        },
        prices: [
          {
            currency_code: CURRENCY_CODE,
            amount: 9900,
          },
          {
            region_id: region.id,
            amount: 9900,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel.id],
    },
  })

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Demo catalogue",
          is_active: true,
        },
      ],
    },
  })
  const demoCategory = categoryResult[0]

  const { result: productOptionsResult } = await createProductOptionsWorkflow(
    container
  ).run({
    input: {
      product_options: [
        {
          title: "Size",
          values: ["One Size"],
        },
      ],
    },
  })
  const sizeOption = productOptionsResult[0]

  await createProductsWorkflow(container).run({
    input: {
      products: DEMO_PRODUCTS.map((item) => ({
        title: item.title,
        handle: item.handle,
        subtitle: "B9 demo product",
        description:
          "Generic catalogue item for demos and local development. Not for sale.",
        category_ids: [demoCategory.id],
        weight: 400,
        status: ProductStatus.PUBLISHED,
        shipping_profile_id: shippingProfile.id,
        thumbnail: item.image,
        images: [{ url: item.image }],
        options: [{ id: sizeOption.id }],
        variants: [
          {
            title: "One Size",
            sku: item.handle.toUpperCase().replace(/-/g, "_"),
            options: {
              Size: "One Size",
            },
            prices: [
              {
                amount: item.amount,
                currency_code: CURRENCY_CODE,
              },
            ],
          },
        ],
        sales_channels: [{ id: defaultSalesChannel.id }],
      })),
    },
  })

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  })

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryItems.map((item) => ({
        location_id: stockLocation.id,
        stocked_quantity: 1000,
        inventory_item_id: item.id,
      })),
    },
  })

  logger.info(
    `Finished seeding ${DEMO_PRODUCTS.length} demo products for South Africa (ZAR).`
  )
}
