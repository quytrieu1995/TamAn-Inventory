import { Pool } from 'pg'
import { readFileSync } from 'fs'
import type { ConnectionOptions } from 'tls'
import { env } from '../config/env'

const buildSslConfig = (): ConnectionOptions | undefined => {
  if (!env.dbSsl) {
    return undefined
  }

  const ssl: ConnectionOptions = {
    rejectUnauthorized: env.dbSslRejectUnauthorized
  }

  if (env.dbSslCaPath) {
    ssl.ca = readFileSync(env.dbSslCaPath, 'utf8')
  }
  if (env.dbSslCertPath) {
    ssl.cert = readFileSync(env.dbSslCertPath, 'utf8')
  }
  if (env.dbSslKeyPath) {
    ssl.key = readFileSync(env.dbSslKeyPath, 'utf8')
  }

  return ssl
}

if (env.NODE_ENV === 'production' && !env.dbSsl) {
  throw new Error('DB_SSL phải bật trong môi trường production')
}

if (env.NODE_ENV === 'production' && !env.dbSslRejectUnauthorized) {
  throw new Error('DB_SSL_REJECT_UNAUTHORIZED phải bật trong môi trường production')
}

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: buildSslConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
})
