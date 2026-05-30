import type { Request } from 'express'
import { ValidationError } from './errors'
import type { AuthContext, PermissionCode } from './types'

const splitHeader = (value: string | string[] | undefined) => {
  const normalized = Array.isArray(value) ? value.join(',') : value ?? ''
  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
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
