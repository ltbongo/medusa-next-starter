import path from 'path'
import { loadEnv, defineConfig } from '@medusajs/framework/utils'

// Payment provider paths are resolved from this config file's directory. At runtime
// medusa-config.js lives under `.medusa/server/` (see docker-entrypoint.sh).
const payfastProviderPath = path.join(__dirname, 'src', 'modules', 'payfast')

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      connection: { ssl: false },
    },
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules: [
    {
      resolve: '@medusajs/medusa/payment',
      options: {
        webhook_delay: 0,
        providers: [
          {
            resolve: payfastProviderPath,
            id: 'payfast',
            options: {},
          },
        ],
      },
    },
  ],
})
