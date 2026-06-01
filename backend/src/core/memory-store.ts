import { createId } from './id'
import type {
  AlertRecord,
  Id,
  Material,
  MaterialBatch,
  MonthlySnapshot,
  ProductionOrder,
  Recipe,
  StockMovement
} from './types'
import type { FoodInventoryRepositories } from './repositories'

type SeedData = {
  materials?: Material[]
  batches?: MaterialBatch[]
  recipes?: Recipe[]
  orders?: ProductionOrder[]
  movements?: StockMovement[]
}

export const createMemoryStore = (seedData: SeedData = {}): FoodInventoryRepositories => {
  const materials = new Map<Id, Material>((seedData.materials ?? []).map((item) => [item.id, item]))
  const batches = new Map<Id, MaterialBatch>((seedData.batches ?? []).map((item) => [item.id, item]))
  const recipes = new Map<Id, Recipe>((seedData.recipes ?? []).map((item) => [item.id, item]))
  const orders = new Map<Id, ProductionOrder>((seedData.orders ?? []).map((item) => [item.id, item]))
  const alerts: AlertRecord[] = []
  const snapshots: MonthlySnapshot[] = []
  const movements = [...(seedData.movements ?? [])]

  return {
    inventory: {
      getMaterialsByIds: async (materialIds) => materialIds.map((id) => materials.get(id)).filter(Boolean) as Material[],
      listBatchesByWarehouseAndMaterial: async (warehouseId, materialId) => {
        return [...batches.values()]
          .filter((batch) => batch.warehouseId === warehouseId && batch.materialId === materialId)
          .sort((left, right) => {
            const dateDiff = new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime()
            if (dateDiff !== 0) {
              return dateDiff
            }

            return left.id.localeCompare(right.id)
          })
      },
      saveBatch: async (batch) => {
        batches.set(batch.id, batch)
      },
      saveMovement: async (movement) => {
        movements.push(movement)
      },
      listMovementsByMonth: async (plantId, monthKey) => {
        return movements.filter((movement) => {
          const movementMonth = movement.movedAt.slice(0, 7)
          return movement.plantId === plantId && movementMonth === monthKey
        })
      },
      listMovementsByWarehouse: async (plantId, warehouseId) => {
        return movements.filter(
          (movement) => movement.plantId === plantId && movement.warehouseId === warehouseId
        )
      },
      listMaterialStocks: async () => {
        return []
      }
    },
    recipe: {
      getRecipeById: async (recipeId) => recipes.get(recipeId) ?? null,
      getLatestRecipeByFinishedGood: async (finishedGoodId) => {
        const matched = Array.from(recipes.values()).filter((recipe) => recipe.finishedGoodId === finishedGoodId)
        if (matched.length === 0) {
          return null
        }
        return matched.sort((left, right) => right.versionNo - left.versionNo)[0]
      },
      getLatestVersionByFinishedGood: async (finishedGoodId) => {
        const matched = Array.from(recipes.values()).filter((recipe) => recipe.finishedGoodId === finishedGoodId)
        return matched.reduce((maximum, recipe) => Math.max(maximum, recipe.versionNo), 0)
      },
      saveRecipe: async (recipe) => {
        recipes.set(recipe.id, recipe)
      }
    },
    production: {
      saveProductionOrder: async (order) => {
        orders.set(order.id, order)
      },
      getProductionOrderById: async (orderId) => orders.get(orderId) ?? null
    },
    alert: {
      saveAlerts: async (newAlerts) => {
        alerts.push(...newAlerts)
      }
    },
    snapshot: {
      saveMonthlySnapshot: async (snapshot) => {
        const index = snapshots.findIndex(
          (item) =>
            item.plantId === snapshot.plantId &&
            item.warehouseId === snapshot.warehouseId &&
            item.monthKey === snapshot.monthKey
        )

        if (index === -1) {
          snapshots.push(snapshot)
          return
        }

        snapshots[index] = snapshot
      }
    }
  }
}

export const createMovementId = () => createId('mov')
export const createBatchId = () => createId('batch')
export const createOrderId = () => createId('po')
export const createAlertId = () => createId('alert')
