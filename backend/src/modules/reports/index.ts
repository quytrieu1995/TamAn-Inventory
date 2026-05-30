import type { InventoryRepository, SnapshotRepository } from '../../core/repositories'
import type { AuthContext, MonthlySnapshot } from '../../core/types'
import { requirePermission, requireWarehouseAccess } from '../auth'

type ReportDependencies = {
  inventoryRepository: InventoryRepository
  snapshotRepository: SnapshotRepository
}

export const reportsModuleBoundaries = {
  name: 'reports',
  responsibilities: [
    'Build inventory and cost dashboards',
    'Generate monthly operational and financial reports',
    'Maintain monthly snapshots for fast query'
  ],
  outOfScope: [
    'Transactional stock writes',
    'Role assignment management'
  ]
} as const

export const createReportService = ({ inventoryRepository, snapshotRepository }: ReportDependencies) => {
  const getDashboard = async (auth: AuthContext, warehouseId: string) => {
    requirePermission(auth, 'report.view')
    requireWarehouseAccess(auth, warehouseId)
    const movements = await inventoryRepository.listMovementsByWarehouse(auth.plantId, warehouseId)

    const totalReceipt = movements
      .filter((movement) => movement.direction === 1 && movement.materialId)
      .reduce((accumulator, movement) => accumulator + movement.quantity * movement.unitCost, 0)

    const totalIssue = movements
      .filter((movement) => movement.direction === -1 && movement.materialId)
      .reduce((accumulator, movement) => accumulator + movement.quantity * movement.unitCost, 0)

    const totalDisposal = movements
      .filter((movement) => movement.movementType === 'DISPOSAL')
      .reduce((accumulator, movement) => accumulator + movement.quantity * movement.unitCost, 0)

    return {
      totalReceipt,
      totalIssue,
      totalDisposal,
      movementCount: movements.length
    }
  }

  const buildMonthlySnapshot = async (
    auth: AuthContext,
    input: {
      monthKey: string
      warehouseId: string
    }
  ) => {
    requirePermission(auth, 'report.manage')
    requireWarehouseAccess(auth, input.warehouseId)
    const movements = await inventoryRepository.listMovementsByMonth(auth.plantId, input.monthKey)
    const scoped = movements.filter((movement) => movement.warehouseId === input.warehouseId)

    const snapshot: MonthlySnapshot = {
      plantId: auth.plantId,
      warehouseId: input.warehouseId,
      monthKey: input.monthKey,
      totalReceiptAmount: scoped
        .filter((movement) => movement.direction === 1 && movement.materialId)
        .reduce((accumulator, movement) => accumulator + movement.quantity * movement.unitCost, 0),
      totalIssueAmount: scoped
        .filter((movement) => movement.direction === -1 && movement.materialId)
        .reduce((accumulator, movement) => accumulator + movement.quantity * movement.unitCost, 0),
      totalDisposalAmount: scoped
        .filter((movement) => movement.movementType === 'DISPOSAL')
        .reduce((accumulator, movement) => accumulator + movement.quantity * movement.unitCost, 0),
      endingInventoryAmount: scoped.reduce((accumulator, movement) => {
        const value = movement.quantity * movement.unitCost
        return accumulator + (movement.direction === 1 ? value : -value)
      }, 0),
      endingInventoryQuantity: scoped.reduce((accumulator, movement) => {
        return accumulator + (movement.direction === 1 ? movement.quantity : -movement.quantity)
      }, 0)
    }

    await snapshotRepository.saveMonthlySnapshot(snapshot)
    return snapshot
  }

  return {
    getDashboard,
    buildMonthlySnapshot
  }
}
