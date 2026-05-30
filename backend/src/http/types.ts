import type { createApplicationServices } from '../index'
import type { Pool } from 'pg'

export type AppServices = ReturnType<typeof createApplicationServices>

export type RouterDependencies = {
  services: AppServices
  pool: Pool
}
