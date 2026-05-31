export type Id = string

export type PermissionCode =
  | 'material.view'
  | 'material.create'
  | 'material.update'
  | 'material.delete'
  | 'material.cancel'
  | 'recipe.view'
  | 'recipe.create'
  | 'recipe.update'
  | 'recipe.delete'
  | 'recipe.cancel'
  | 'recipe.manage'
  | 'supplier.view'
  | 'supplier.create'
  | 'supplier.update'
  | 'supplier.delete'
  | 'supplier.cancel'
  | 'inventory.receive'
  | 'inventory.issue'
  | 'inventory.adjust'
  | 'inventory.cancel'
  | 'production.view'
  | 'production.create'
  | 'production.approve'
  | 'production.update'
  | 'production.delete'
  | 'production.cancel'
  | 'report.view'
  | 'report.create'
  | 'report.update'
  | 'report.delete'
  | 'report.cancel'
  | 'report.manage'
  | 'supplier.manage'
  | 'material.manage'
  | 'user.manage'

export type AuthContext = {
  userId: Id
  plantId: Id
  warehouseIds: Id[]
  permissions: PermissionCode[]
}

export type Material = {
  id: Id
  plantId: Id
  code: string
  name: string
  uom: string
  minimumStock: number
  maxStorageDays: number
}

export type MaterialBatch = {
  id: Id
  plantId: Id
  warehouseId: Id
  materialId: Id
  batchNo: string
  receivedAt: string
  qtyReceived: number
  qtyAvailable: number
  unitPrice: number
}

export type RecipeItem = {
  materialId: Id
  qtyPerUnit: number
}

export type Recipe = {
  id: Id
  plantId: Id
  finishedGoodId: Id
  name: string
  versionNo: number
  items: RecipeItem[]
  updatedAt: string
}

export type StockMovementType =
  | 'RECEIPT'
  | 'ISSUE'
  | 'ADJUSTMENT_PLUS'
  | 'ADJUSTMENT_MINUS'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'PRODUCTION_CONSUME'
  | 'PRODUCTION_OUTPUT'
  | 'DISPOSAL'

export type StockMovement = {
  id: Id
  plantId: Id
  warehouseId: Id
  materialId?: Id
  finishedGoodId?: Id
  batchId?: Id
  movementType: StockMovementType
  direction: -1 | 1
  quantity: number
  unitCost: number
  referenceType: string
  referenceId: Id
  movedAt: string
}

export type ProductionOrderStatus =
  | 'DRAFT'
  | 'RELEASED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type ProductionOrder = {
  id: Id
  plantId: Id
  warehouseId: Id
  orderNo: string
  finishedGoodId: Id
  recipeId: Id
  plannedQty: number
  actualQty: number
  status: ProductionOrderStatus
  createdAt: string
}

export type AlertType = 'LOW_STOCK' | 'OVER_STORAGE_DAYS'

export type AlertRecord = {
  id: Id
  plantId: Id
  warehouseId: Id
  materialId: Id
  batchId?: Id
  type: AlertType
  message: string
  triggeredAt: string
}

export type MonthlySnapshot = {
  plantId: Id
  warehouseId: Id
  monthKey: string
  totalReceiptAmount: number
  totalIssueAmount: number
  totalDisposalAmount: number
  endingInventoryAmount: number
  endingInventoryQuantity: number
}

export type MaterialStockRow = {
  materialId: Id
  code: string
  name: string
  batchId: Id
  batchNo: string
  quantityOnHand: number
  minimumStock: number
  storageDays: number
}
