const path = require("path")
const { loadEnv, defineConfig } = require("@medusajs/framework/utils")

loadEnv(process.env.NODE_ENV || "development", process.cwd())

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
            // Build runs from `apps/backend`; production copies this file into `.medusa/server/`.
            resolve: path.join(
              __dirname,
              ...(path.basename(__dirname) === "server" &&
              path.basename(path.dirname(__dirname)) === ".medusa"
                ? ["..", "..", "src", "modules", "payfast"]
                : ["src", "modules", "payfast"])
            ),
            id: "payfast",
            options: {},
          },
        ],
      },
    },
  ],
})
