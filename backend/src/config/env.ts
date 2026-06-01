import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/taman_inventory'),
  DB_SSL: z.string().optional().default('false'),
  DB_SSL_REJECT_UNAUTHORIZED: z.string().optional().default('true'),
  DB_SSL_CA_PATH: z.string().optional(),
  DB_SSL_CERT_PATH: z.string().optional(),
  DB_SSL_KEY_PATH: z.string().optional(),
  ALLOW_DEMO_PASSWORD_FALLBACK: z.string().optional().default('false'),
  ALLOW_LEGACY_PLAINTEXT_PASSWORD_FALLBACK: z.string().optional().default('false'),
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
  dbSsl: ['true', '1', 'yes'].includes(parsed.data.DB_SSL.toLowerCase()),
  dbSslRejectUnauthorized: ['true', '1', 'yes'].includes(parsed.data.DB_SSL_REJECT_UNAUTHORIZED.toLowerCase()),
  dbSslCaPath: parsed.data.DB_SSL_CA_PATH?.trim() || undefined,
  dbSslCertPath: parsed.data.DB_SSL_CERT_PATH?.trim() || undefined,
  dbSslKeyPath: parsed.data.DB_SSL_KEY_PATH?.trim() || undefined,
  allowDemoPasswordFallback: ['true', '1', 'yes'].includes(parsed.data.ALLOW_DEMO_PASSWORD_FALLBACK.toLowerCase()),
  allowLegacyPlaintextPasswordFallback: ['true', '1', 'yes'].includes(parsed.data.ALLOW_LEGACY_PLAINTEXT_PASSWORD_FALLBACK.toLowerCase()),
  enableAlertCron: parsed.data.ENABLE_ALERT_CRON === 'true',
  alertMailTo: parsed.data.ALERT_MAIL_TO.split(',').map((item) => item.trim()).filter(Boolean),
  enableIdempotencyCleanupCron: parsed.data.ENABLE_IDEMPOTENCY_CLEANUP_CRON === 'true'
}
