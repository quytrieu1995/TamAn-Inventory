import type { Request } from 'express'
import type { Pool } from 'pg'
import { ValidationError } from './errors'
import type { AuthContext, PermissionCode } from './types'

let ensureUserPermissionsTablePromise: Promise<void> | null = null

const ensureUserPermissionsTable = async (pool: Pool) => {
  if (!ensureUserPermissionsTablePromise) {
    ensureUserPermissionsTablePromise = (async () => {
      await pool.query(
        `
          CREATE TABLE IF NOT EXISTS user_permissions (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            plant_id UUID REFERENCES plants(id),
            warehouse_id UUID REFERENCES warehouses(id),
            PRIMARY KEY (user_id, permission_id, plant_id, warehouse_id)
          )
        `
      )
    })()
  }

  await ensureUserPermissionsTablePromise
}

const splitHeader = (value: string | string[] | undefined) => {
  const normalized = Array.isArray(value) ? value.join(',') : value ?? ''
  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const listPermissionsFromDatabase = async (pool: Pool, userId: string, plantId: string) => {
  await ensureUserPermissionsTable(pool)
  const result = await pool.query(
    `
      SELECT DISTINCT code
      FROM (
        SELECT p.code
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        INNER JOIN role_permissions rp ON rp.role_id = r.id
        INNER JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1
          AND (ur.plant_id IS NULL OR ur.plant_id = $2)

        UNION

        SELECT p.code
        FROM user_permissions up
        INNER JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = $1
          AND (up.plant_id IS NULL OR up.plant_id = $2)
      ) permission_union
      ORDER BY code ASC
    `,
    [userId, plantId]
  )

  return result.rows.map((row) => String(row.code)) as PermissionCode[]
}

const listWarehousesFromDatabase = async (pool: Pool, userId: string, plantId: string) => {
  const result = await pool.query(
    `
      SELECT
        bool_or(ur.warehouse_id IS NULL) AS has_all_warehouses,
        array_remove(array_agg(DISTINCT ur.warehouse_id::text), NULL) AS warehouse_ids
      FROM user_roles ur
      WHERE ur.user_id = $1
        AND (ur.plant_id IS NULL OR ur.plant_id = $2)
    `,
    [userId, plantId]
  )

  const row = result.rows[0]
  const hasAllWarehouses = Boolean(row?.has_all_warehouses)
  if (hasAllWarehouses) {
    return []
  }

  const values = Array.isArray(row?.warehouse_ids) ? row.warehouse_ids : []
  return values.map((value: unknown) => String(value))
}

export const getAuthContextFromRequest = (request: Request): AuthContext => {
  const userId = request.header('x-user-id') ?? 'anonymous'
  const plantId = request.header('x-plant-id')
  if (!plantId) {
    throw new ValidationError('Missing required x-plant-id header')
  }

  const warehouseIds = splitHeader(request.header('x-warehouse-ids'))
  const permissions = splitHeader(request.header('x-permissions')) as PermissionCode[]

  return {
    userId,
    plantId,
    warehouseIds,
    permissions
  }
}

export const resolveAuthContextFromRequest = async (request: Request, pool: Pool): Promise<AuthContext> => {
  const userId = request.header('x-user-id') ?? 'anonymous'
  const plantId = request.header('x-plant-id')
  if (!plantId) {
    throw new ValidationError('Missing required x-plant-id header')
  }

  const headerWarehouseIds = splitHeader(request.header('x-warehouse-ids'))
  const headerPermissions = splitHeader(request.header('x-permissions')) as PermissionCode[]

  const permissions = headerPermissions.length > 0
    ? headerPermissions
    : await listPermissionsFromDatabase(pool, userId, plantId)

  const warehouseIds = headerWarehouseIds.length > 0
    ? headerWarehouseIds
    : await listWarehousesFromDatabase(pool, userId, plantId)

  return {
    userId,
    plantId,
    warehouseIds,
    permissions
  }
}
