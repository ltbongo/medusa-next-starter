import { configureStoreSearch, defineMiddlewares } from '@medusajs/framework/http'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      methods: ['POST'],
      matcher: '/hooks/payfast/itn',
      bodyParser: { preserveRawBody: true },
    },
    {
      methods: ['POST'],
      matcher: '/hooks/payment/payfast',
      bodyParser: { preserveRawBody: true },
    },
    {
      method: ['POST'],
      matcher: '/store/payfast/reconcile',
      middlewares: [],
    },
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
  ],
})
