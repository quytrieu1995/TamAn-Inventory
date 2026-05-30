import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/taman_inventory'),
  DB_SSL: z.string().optional().default('false'),
  ALERT_CRON: z.string().default('0 7 * * *'),
  ENABLE_ALERT_CRON: z.string().optional().default('false'),
  ALERT_MAIL_TO: z.string().default('ops@example.com'),
  ENABLE_IDEMPOTENCY_CLEANUP_CRON: z.string().optional().default('true'),
  IDEMPOTENCY_CLEANUP_CRON: z.string().default('0 * * * *'),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24)
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join('; ')
  throw new Error(`Invalid environment configuration: ${message}`)
}

export const env = {
  ...parsed.data,
  dbSsl: parsed.data.DB_SSL === 'true',
  enableAlertCron: parsed.data.ENABLE_ALERT_CRON === 'true',
  alertMailTo: parsed.data.ALERT_MAIL_TO.split(',').map((item) => item.trim()).filter(Boolean),
  enableIdempotencyCleanupCron: parsed.data.ENABLE_IDEMPOTENCY_CLEANUP_CRON === 'true'
}
