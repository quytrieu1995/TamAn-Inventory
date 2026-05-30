import { ForbiddenError } from '../../core/errors'
import type { AuthContext, PermissionCode } from '../../core/types'

export const authModuleBoundaries = {
  name: 'auth',
  responsibilities: [
    'Authenticate user sessions',
    'Resolve effective permissions and role scopes',
    'Authorize API actions by permission codes'
  ],
  outOfScope: [
    'Inventory valuation logic',
    'Monthly reporting aggregation'
  ]
} as const

export const hasPermission = (auth: AuthContext, permission: PermissionCode) => {
  return auth.permissions.includes(permission)
}

export const requirePermission = (auth: AuthContext, permission: PermissionCode) => {
  if (hasPermission(auth, permission)) {
    return
  }

  throw new ForbiddenError(permission)
}

export const canAccessWarehouse = (auth: AuthContext, warehouseId: string) => {
  return auth.warehouseIds.length === 0 || auth.warehouseIds.includes(warehouseId)
}

export const requireWarehouseAccess = (auth: AuthContext, warehouseId: string) => {
  if (canAccessWarehouse(auth, warehouseId)) {
    return
  }

  throw new ForbiddenError(`warehouse:${warehouseId}`)
}
