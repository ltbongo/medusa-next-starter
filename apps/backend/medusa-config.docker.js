/**
 * Runtime Medusa config for Docker (copied into `.medusa/server/` on container start).
 * Provider path must target compiled output under `.medusa/server/src`, not TS under `apps/backend/src`.
 */
const path = require("path")
const { loadEnv, defineConfig } = require("@medusajs/framework/utils")

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const payfastProviderPath = path.join(
  "/app/apps/backend/.medusa/server/src/modules/payfast"
)

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      connection: { ssl: false },
    },
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS,
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        webhook_delay: 0,
        providers: [
          {
            resolve: payfastProviderPath,
            id: "payfast",
            options: {},
          },
        ],
      },
    },
  ],
})
