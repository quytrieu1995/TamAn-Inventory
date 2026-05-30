import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import type { Logger } from 'pino'
import { env } from '../config/env'
import { logger } from '../core/logger'
import { createPostgresRepositories } from '../db/postgres-repositories'
import { dbPool } from '../db/pool'
import { createApplicationServices } from '../index'
import { errorHandler } from './error-handler'
import { createRouter } from './routes'
import type { Pool } from 'pg'

type CreateAppOptions = {
  pool?: Pool
  appLogger?: Logger
}

export const createApp = (options: CreateAppOptions = {}) => {
  const pool = options.pool ?? dbPool
  const appLogger = options.appLogger ?? logger
  const repositories = createPostgresRepositories(pool)
  const services = createApplicationServices(repositories)

  const app = express()
  app.use(helmet())
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use(
    pinoHttp({
      logger: appLogger
    })
  )

  app.get('/health', async (_request, response) => {
    const result = await pool.query('SELECT 1 as ok')
    return response.json({
      success: true,
      data: {
        ok: result.rows[0]?.ok === 1,
        env: env.NODE_ENV
      }
    })
  })

  app.use('/api/v1', createRouter({ services, pool }))
  app.use(errorHandler)

  return {
    app,
    services
  }
}
