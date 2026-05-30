import cron from 'node-cron'
import { env } from './config/env'
import { logger } from './core/logger'
import { createApp } from './http/app'
import { cleanupExpiredIdempotencyKeys } from './http/idempotency'
import { dbPool } from './db/pool'

const { app, services } = createApp()

if (env.enableAlertCron) {
  cron.schedule(env.ALERT_CRON, async () => {
    logger.info('Alert cron ticked but requires explicit payload by design')
    await Promise.resolve(services)
  })
}

if (env.enableIdempotencyCleanupCron) {
  cron.schedule(env.IDEMPOTENCY_CLEANUP_CRON, async () => {
    const result = await cleanupExpiredIdempotencyKeys(dbPool, env.IDEMPOTENCY_TTL_HOURS)
    logger.info(
      {
        deletedCount: result.deletedCount,
        ttlHours: env.IDEMPOTENCY_TTL_HOURS
      },
      'Idempotency key cleanup completed'
    )
  })
}

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server started')
})
