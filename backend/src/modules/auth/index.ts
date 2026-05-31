import { ForbiddenError } from '../../core/errors'
import type { AuthContext, PermissionCode } from '../../core/types'

const PERMISSION_FALLBACKS: Partial<Record<PermissionCode, PermissionCode[]>> = {
  'material.view': ['material.manage'],
  'material.create': ['material.manage'],
  'material.update': ['material.manage'],
  'material.delete': ['material.manage'],
  'material.cancel': ['material.manage'],
  'supplier.view': ['supplier.manage'],
  'supplier.create': ['supplier.manage'],
  'supplier.update': ['supplier.manage'],
  'supplier.delete': ['supplier.manage'],
  'supplier.cancel': ['supplier.manage'],
  'recipe.create': ['recipe.manage'],
  'recipe.update': ['recipe.manage'],
  'recipe.delete': ['recipe.manage'],
  'recipe.cancel': ['recipe.manage'],
  'production.view': ['production.create'],
  'production.approve': ['production.create'],
  'production.update': ['production.create'],
  'production.delete': ['production.create'],
  'production.cancel': ['production.create'],
  'report.create': ['report.manage'],
  'report.update': ['report.manage'],
  'report.delete': ['report.manage'],
  'report.cancel': ['report.manage'],
  'inventory.cancel': ['inventory.adjust']
}

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
  if (auth.permissions.includes(permission)) {
    return true
  }

  const fallbackPermissions = PERMISSION_FALLBACKS[permission] ?? []
  return fallbackPermissions.some((fallback) => auth.permissions.includes(fallback))
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
