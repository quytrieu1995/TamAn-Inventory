import { ConflictError, NotFoundError } from '../../core/errors'
import { createMovementId, createOrderId } from '../../core/memory-store'
import type { InventoryRepository, ProductionRepository, RecipeRepository } from '../../core/repositories'
import type { AuthContext, ProductionOrder, StockMovement } from '../../core/types'
import { requirePermission, requireWarehouseAccess } from '../auth'
import { createInventoryService } from '../inventory'

type FinishedGoodsDependencies = {
  inventoryRepository: InventoryRepository
  recipeRepository: RecipeRepository
  productionRepository: ProductionRepository
}

export const finishedGoodsModuleBoundaries = {
  name: 'finished-goods',
  responsibilities: [
    'Create and manage production orders',
    'Coordinate raw material consumption from inventory module',
    'Post finished goods output into warehouse stock'
  ],
  outOfScope: [
    'Supplier onboarding',
    'Global RBAC policy definition'
  ]
} as const

export const createFinishedGoodsService = ({
  inventoryRepository,
  recipeRepository,
  productionRepository
}: FinishedGoodsDependencies) => {
  const inventoryService = createInventoryService({ inventoryRepository })

  const createProductionOrder = async (
    auth: AuthContext,
    input: {
      warehouseId: string
      orderNo: string
      finishedGoodId: string
      recipeId: string
      plannedQty: number
    }
  ) => {
    requirePermission(auth, 'production.create')
    requireWarehouseAccess(auth, input.warehouseId)
    const recipe = await recipeRepository.getRecipeById(input.recipeId)
    if (!recipe) {
      throw new NotFoundError('Recipe')
    }

    const order: ProductionOrder = {
      id: createOrderId(),
      plantId: auth.plantId,
      warehouseId: input.warehouseId,
      orderNo: input.orderNo,
      finishedGoodId: input.finishedGoodId,
      recipeId: input.recipeId,
      plannedQty: input.plannedQty,
      actualQty: 0,
      status: 'RELEASED',
      createdAt: new Date().toISOString()
    }
    await productionRepository.saveProductionOrder(order)
    return order
  }

  const consumeMaterialsForOrder = async (
    auth: AuthContext,
    input: {
      orderId: string
      movedAt: string
    }
  ) => {
    requirePermission(auth, 'production.create')
    const order = await productionRepository.getProductionOrderById(input.orderId)
    if (!order) {
      throw new NotFoundError('Production order')
    }
    requireWarehouseAccess(auth, order.warehouseId)

    const recipe = await recipeRepository.getRecipeById(order.recipeId)
    if (!recipe) {
      throw new NotFoundError('Recipe')
    }

    const issueItems = recipe.items.map((item) => ({
      materialId: item.materialId,
      quantity: Number((item.qtyPerUnit * order.plannedQty).toFixed(3))
    }))

    return inventoryService.issueMaterialsFifo(auth, {
      warehouseId: order.warehouseId,
      referenceType: 'PRODUCTION',
      referenceId: order.id,
      movedAt: input.movedAt,
      items: issueItems
    })
  }

  const completeProductionOrder = async (
    auth: AuthContext,
    input: {
      orderId: string
      actualQty: number
      movedAt: string
      outputUnitCost: number
    }
  ) => {
    requirePermission(auth, 'production.create')
    const order = await productionRepository.getProductionOrderById(input.orderId)
    if (!order) {
      throw new NotFoundError('Production order')
    }
    requireWarehouseAccess(auth, order.warehouseId)

    if (input.actualQty <= 0) {
      throw new ConflictError('Actual quantity must be greater than zero')
    }

    const completedOrder: ProductionOrder = {
      ...order,
      actualQty: input.actualQty,
      status: 'COMPLETED'
    }
    await productionRepository.saveProductionOrder(completedOrder)

    const outputMovement: StockMovement = {
      id: createMovementId(),
      plantId: auth.plantId,
      warehouseId: order.warehouseId,
      finishedGoodId: order.finishedGoodId,
      movementType: 'PRODUCTION_OUTPUT',
      direction: 1,
      quantity: input.actualQty,
      unitCost: input.outputUnitCost,
      referenceType: 'PRODUCTION_ORDER',
      referenceId: order.id,
      movedAt: input.movedAt
    }

    await inventoryRepository.saveMovement(outputMovement)
    return {
      order: completedOrder,
      movement: outputMovement
    }
  }

  return {
    createProductionOrder,
    consumeMaterialsForOrder,
    completeProductionOrder
  }
}
