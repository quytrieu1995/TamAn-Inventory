import { Pool } from 'pg'
import { env } from '../config/env'

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
})
