import type {
  AlertRecord,
  Id,
  Material,
  MaterialBatch,
  MaterialStockRow,
  MonthlySnapshot,
  ProductionOrder,
  Recipe,
  StockMovement
} from './types'

export type ReceiptItemInput = {
  materialId: Id
  batchNo: string
  quantity: number
  unitPrice: number
}

export type InventoryRepository = {
  getMaterialsByIds: (materialIds: Id[]) => Promise<Material[]>
  listBatchesByWarehouseAndMaterial: (
    warehouseId: Id,
    materialId: Id,
    options?: {
      forUpdate?: boolean
    }
  ) => Promise<MaterialBatch[]>
  saveBatch: (batch: MaterialBatch) => Promise<void>
  saveMovement: (movement: StockMovement) => Promise<void>
  listMovementsByMonth: (plantId: Id, monthKey: string) => Promise<StockMovement[]>
  listMovementsByWarehouse: (plantId: Id, warehouseId: Id) => Promise<StockMovement[]>
  listMaterialStocks: (plantId: Id, warehouseId: Id) => Promise<MaterialStockRow[]>
}

export type RecipeRepository = {
  getRecipeById: (recipeId: Id) => Promise<Recipe | null>
  getLatestVersionByFinishedGood: (finishedGoodId: Id) => Promise<number>
  saveRecipe: (recipe: Recipe) => Promise<void>
}

export type ProductionRepository = {
  saveProductionOrder: (order: ProductionOrder) => Promise<void>
  getProductionOrderById: (orderId: Id) => Promise<ProductionOrder | null>
}

export type AlertRepository = {
  saveAlerts: (alerts: AlertRecord[]) => Promise<void>
}

export type SnapshotRepository = {
  saveMonthlySnapshot: (snapshot: MonthlySnapshot) => Promise<void>
}

export type FoodInventoryRepositories = {
  inventory: InventoryRepository
  recipe: RecipeRepository
  production: ProductionRepository
  alert: AlertRepository
  snapshot: SnapshotRepository
}
