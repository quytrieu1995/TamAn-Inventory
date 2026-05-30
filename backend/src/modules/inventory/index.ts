import { ConflictError, NotFoundError } from '../../core/errors'
import type { InventoryRepository } from '../../core/repositories'
import { createBatchId, createMovementId } from '../../core/memory-store'
import type { AuthContext, MaterialBatch, StockMovement } from '../../core/types'
import { requirePermission, requireWarehouseAccess } from '../auth'

type ReceiptItemInput = {
  materialId: string
  batchNo: string
  quantity: number
  unitPrice: number
}

type IssueItemInput = {
  materialId: string
  quantity: number
}

type Allocation = {
  batch: MaterialBatch
  quantity: number
}

type InventoryServiceDependencies = {
  inventoryRepository: InventoryRepository
}

export const inventoryModuleBoundaries = {
  name: 'inventory',
  responsibilities: [
    'Handle receipt, issue, adjustment, transfer operations',
    'Allocate FIFO batches for material issues',
    'Write immutable inventory ledger entries'
  ],
  outOfScope: [
    'Recipe authoring',
    'Supplier contract management'
  ]
} as const

const allocateFifo = (batches: MaterialBatch[], requiredQuantity: number): Allocation[] => {
  let remainingQuantity = requiredQuantity
  const allocations: Allocation[] = []

  for (const batch of batches) {
    if (remainingQuantity <= 0) {
      break
    }

    if (batch.qtyAvailable <= 0) {
      continue
    }

    const issuedQuantity = Math.min(batch.qtyAvailable, remainingQuantity)
    allocations.push({
      batch,
      quantity: issuedQuantity
    })
    remainingQuantity -= issuedQuantity
  }

  if (remainingQuantity > 0) {
    throw new ConflictError(`Insufficient stock for FIFO issue: short ${remainingQuantity}`)
  }

  return allocations
}

export const createInventoryService = ({ inventoryRepository }: InventoryServiceDependencies) => {
  const receiveMaterials = async (
    auth: AuthContext,
    input: {
      receiptId: string
      warehouseId: string
      receivedAt: string
      items: ReceiptItemInput[]
    }
  ) => {
    requirePermission(auth, 'inventory.receive')
    requireWarehouseAccess(auth, input.warehouseId)

    const movements: StockMovement[] = []
    const batches: MaterialBatch[] = []

    for (const item of input.items) {
      const batch: MaterialBatch = {
        id: createBatchId(),
        plantId: auth.plantId,
        warehouseId: input.warehouseId,
        materialId: item.materialId,
        batchNo: item.batchNo,
        receivedAt: input.receivedAt,
        qtyReceived: item.quantity,
        qtyAvailable: item.quantity,
        unitPrice: item.unitPrice
      }

      await inventoryRepository.saveBatch(batch)
      batches.push(batch)

      const movement: StockMovement = {
        id: createMovementId(),
        plantId: auth.plantId,
        warehouseId: input.warehouseId,
        materialId: item.materialId,
        batchId: batch.id,
        movementType: 'RECEIPT',
        direction: 1,
        quantity: item.quantity,
        unitCost: item.unitPrice,
        referenceType: 'PURCHASE_RECEIPT',
        referenceId: input.receiptId,
        movedAt: input.receivedAt
      }

      await inventoryRepository.saveMovement(movement)
      movements.push(movement)
    }

    return {
      batches,
      movements
    }
  }

  const issueMaterialsFifo = async (
    auth: AuthContext,
    input: {
      warehouseId: string
      referenceType: string
      referenceId: string
      movedAt: string
      items: IssueItemInput[]
    }
  ) => {
    requirePermission(auth, 'inventory.issue')
    requireWarehouseAccess(auth, input.warehouseId)

    const movements: StockMovement[] = []

    for (const item of input.items) {
      const candidateBatches = await inventoryRepository.listBatchesByWarehouseAndMaterial(
        input.warehouseId,
        item.materialId,
        {
          forUpdate: true
        }
      )
      const allocations = allocateFifo(candidateBatches, item.quantity)

      for (const allocation of allocations) {
        const updatedBatch: MaterialBatch = {
          ...allocation.batch,
          qtyAvailable: Number((allocation.batch.qtyAvailable - allocation.quantity).toFixed(3))
        }
        await inventoryRepository.saveBatch(updatedBatch)

        const movement: StockMovement = {
          id: createMovementId(),
          plantId: auth.plantId,
          warehouseId: input.warehouseId,
          materialId: item.materialId,
          batchId: allocation.batch.id,
          movementType: input.referenceType === 'PRODUCTION'
            ? 'PRODUCTION_CONSUME'
            : input.referenceType === 'DISPOSAL'
              ? 'DISPOSAL'
              : 'ISSUE',
          direction: -1,
          quantity: allocation.quantity,
          unitCost: allocation.batch.unitPrice,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          movedAt: input.movedAt
        }
        await inventoryRepository.saveMovement(movement)
        movements.push(movement)
      }
    }

    return { movements }
  }

  const adjustInventory = async (
    auth: AuthContext,
    input: {
      warehouseId: string
      materialId: string
      batchId?: string
      quantity: number
      reason: string
      referenceId: string
      movedAt: string
    }
  ) => {
    requirePermission(auth, 'inventory.adjust')
    requireWarehouseAccess(auth, input.warehouseId)

    if (input.quantity === 0) {
      throw new ConflictError('Adjustment quantity must be non-zero')
    }

    const movementType = input.quantity > 0 ? 'ADJUSTMENT_PLUS' : 'ADJUSTMENT_MINUS'
    const movement: StockMovement = {
      id: createMovementId(),
      plantId: auth.plantId,
      warehouseId: input.warehouseId,
      materialId: input.materialId,
      batchId: input.batchId,
      movementType,
      direction: input.quantity > 0 ? 1 : -1,
      quantity: Math.abs(input.quantity),
      unitCost: 0,
      referenceType: 'ADJUSTMENT',
      referenceId: input.referenceId,
      movedAt: input.movedAt
    }

    await inventoryRepository.saveMovement(movement)
    return movement
  }

  const getWarehouseLedger = async (auth: AuthContext, warehouseId: string) => {
    requireWarehouseAccess(auth, warehouseId)
    const movements = await inventoryRepository.listMovementsByWarehouse(auth.plantId, warehouseId)
    if (!movements.length) {
      throw new NotFoundError('Ledger')
    }

    return movements
  }

  const getMaterialStocks = async (auth: AuthContext, warehouseId: string) => {
    requireWarehouseAccess(auth, warehouseId)
    const rows = await inventoryRepository.listMaterialStocks(auth.plantId, warehouseId)
    return rows
  }

  return {
    receiveMaterials,
    issueMaterialsFifo,
    adjustInventory,
    getWarehouseLedger,
    getMaterialStocks
  }
}
