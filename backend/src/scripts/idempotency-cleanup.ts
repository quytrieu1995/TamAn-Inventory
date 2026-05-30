import { env } from '../config/env'
import { logger } from '../core/logger'
import { dbPool } from '../db/pool'
import { cleanupExpiredIdempotencyKeys } from '../http/idempotency'

const run = async () => {
  const result = await cleanupExpiredIdempotencyKeys(dbPool, env.IDEMPOTENCY_TTL_HOURS)
  logger.info(
    {
      deletedCount: result.deletedCount,
      ttlHours: env.IDEMPOTENCY_TTL_HOURS
    },
    'Manual idempotency cleanup completed'
  )
}

run()
  .catch((error) => {
    logger.error({ error }, 'Manual idempotency cleanup failed')
    process.exitCode = 1
  })
  .finally(async () => {
    await dbPool.end()
  })
