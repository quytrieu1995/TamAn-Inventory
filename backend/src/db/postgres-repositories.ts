import type { Pool, PoolClient } from 'pg'
import type {
  Material,
  MaterialBatch,
  MaterialStockRow,
  ProductionOrder,
  StockMovement
} from '../core/types'
import type { FoodInventoryRepositories } from '../core/repositories'

type DbExecutor = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>

const mapMaterial = (row: Record<string, unknown>): Material => ({
  id: String(row.id),
  plantId: String(row.plant_id),
  code: String(row.code),
  name: String(row.name),
  uom: String(row.uom),
  minimumStock: Number(row.minimum_stock),
  maxStorageDays: Number(row.max_storage_days)
})

const mapBatch = (row: Record<string, unknown>): MaterialBatch => ({
  id: String(row.id),
  plantId: String(row.plant_id),
  warehouseId: String(row.warehouse_id),
  materialId: String(row.material_id),
  batchNo: String(row.batch_no),
  receivedAt: new Date(String(row.received_at)).toISOString(),
  qtyReceived: Number(row.qty_received),
  qtyAvailable: Number(row.qty_available),
  unitPrice: Number(row.unit_price)
})

const mapMovement = (row: Record<string, unknown>): StockMovement => ({
  id: String(row.id),
  plantId: String(row.plant_id),
  warehouseId: String(row.warehouse_id),
  materialId: row.material_id ? String(row.material_id) : undefined,
  finishedGoodId: row.finished_good_id ? String(row.finished_good_id) : undefined,
  batchId: row.material_batch_id ? String(row.material_batch_id) : undefined,
  movementType: String(row.movement_type) as StockMovement['movementType'],
  direction: Number(row.direction) as -1 | 1,
  quantity: Number(row.quantity),
  unitCost: Number(row.unit_cost),
  referenceType: String(row.reference_type),
  referenceId: String(row.reference_id),
  movedAt: new Date(String(row.moved_at)).toISOString()
})

const mapProductionOrder = (row: Record<string, unknown>): ProductionOrder => ({
  id: String(row.id),
  plantId: String(row.plant_id),
  warehouseId: String(row.warehouse_id),
  orderNo: String(row.order_no),
  finishedGoodId: String(row.finished_good_id),
  recipeId: String(row.recipe_id),
  plannedQty: Number(row.planned_qty),
  actualQty: Number(row.actual_qty),
  status: String(row.status) as ProductionOrder['status'],
  createdAt: new Date(String(row.created_at)).toISOString()
})

const mapMaterialStock = (row: Record<string, unknown>): MaterialStockRow => ({
  materialId: String(row.material_id),
  code: String(row.material_code),
  name: String(row.material_name),
  batchId: String(row.batch_id),
  batchNo: String(row.batch_no),
  quantityOnHand: Number(row.quantity_on_hand),
  minimumStock: Number(row.minimum_stock),
  storageDays: Number(row.storage_days)
})

const createInventoryRepository = (db: DbExecutor): FoodInventoryRepositories['inventory'] => ({
  getMaterialsByIds: async (materialIds) => {
    if (!materialIds.length) {
      return []
    }

    const result = await db.query(
      `
        SELECT id, plant_id, code, name, uom, minimum_stock, max_storage_days
        FROM materials
        WHERE id = ANY($1::uuid[])
      `,
      [materialIds]
    )

    return result.rows.map(mapMaterial)
  },

  listBatchesByWarehouseAndMaterial: async (warehouseId, materialId, options = {}) => {
    const lockClause = options.forUpdate ? 'FOR UPDATE' : ''
    const result = await db.query(
      `
        SELECT id, plant_id, warehouse_id, material_id, batch_no, received_at, qty_received, qty_available, unit_price
        FROM material_batches
        WHERE warehouse_id = $1
          AND material_id = $2
          AND qty_available > 0
        ORDER BY received_at ASC, id ASC
        ${lockClause}
      `,
      [warehouseId, materialId]
    )

    return result.rows.map(mapBatch)
  },

  saveBatch: async (batch) => {
    await db.query(
      `
        INSERT INTO material_batches (
          id, plant_id, warehouse_id, material_id, batch_no, received_at,
          qty_received, qty_available, unit_price, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (id)
        DO UPDATE SET qty_available = EXCLUDED.qty_available
      `,
      [
        batch.id,
        batch.plantId,
        batch.warehouseId,
        batch.materialId,
        batch.batchNo,
        batch.receivedAt,
        batch.qtyReceived,
        batch.qtyAvailable,
        batch.unitPrice
      ]
    )
  },

  saveMovement: async (movement) => {
    await db.query(
      `
        INSERT INTO stock_movements (
          id, plant_id, warehouse_id, material_id, finished_good_id,
          material_batch_id, movement_type, direction, quantity, unit_cost,
          reference_type, reference_id, moved_at, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, now()
        )
      `,
      [
        movement.id,
        movement.plantId,
        movement.warehouseId,
        movement.materialId ?? null,
        movement.finishedGoodId ?? null,
        movement.batchId ?? null,
        movement.movementType,
        movement.direction,
        movement.quantity,
        movement.unitCost,
        movement.referenceType,
        movement.referenceId,
        movement.movedAt
      ]
    )
  },

  listMovementsByMonth: async (plantId, monthKey) => {
    const monthStart = new Date(`${monthKey}-01T00:00:00.000Z`)
    const monthEnd = new Date(monthStart)
    monthEnd.setUTCMonth(monthStart.getUTCMonth() + 1)

    const result = await db.query(
      `
        SELECT id, plant_id, warehouse_id, material_id, finished_good_id, material_batch_id,
               movement_type, direction, quantity, unit_cost, reference_type, reference_id, moved_at
        FROM stock_movements
        WHERE plant_id = $1
          AND moved_at >= $2
          AND moved_at < $3
      `,
      [plantId, monthStart.toISOString(), monthEnd.toISOString()]
    )

    return result.rows.map(mapMovement)
  },

  listMovementsByWarehouse: async (plantId, warehouseId) => {
    const result = await db.query(
      `
        SELECT id, plant_id, warehouse_id, material_id, finished_good_id, material_batch_id,
               movement_type, direction, quantity, unit_cost, reference_type, reference_id, moved_at
        FROM stock_movements
        WHERE plant_id = $1 AND warehouse_id = $2
        ORDER BY moved_at DESC
      `,
      [plantId, warehouseId]
    )

    return result.rows.map(mapMovement)
  },

  listMaterialStocks: async (plantId, warehouseId) => {
    const result = await db.query(
      `
        SELECT
          m.id AS material_id,
          m.code AS material_code,
          m.name AS material_name,
          b.id AS batch_id,
          b.batch_no,
          b.qty_available AS quantity_on_hand,
          m.minimum_stock,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - b.received_at)) / 86400))::int AS storage_days
        FROM material_batches b
        INNER JOIN materials m ON m.id = b.material_id
        WHERE b.plant_id = $1
          AND b.warehouse_id = $2
          AND b.qty_available > 0
        ORDER BY m.code ASC, b.received_at ASC
      `,
      [plantId, warehouseId]
    )

    return result.rows.map(mapMaterialStock)
  }
})

const createRecipeRepository = (db: DbExecutor): FoodInventoryRepositories['recipe'] => ({
  getRecipeById: async (recipeId) => {
    const recipeResult = await db.query(
      `
        SELECT r.id, r.plant_id, r.finished_good_id, r.version_no, r.updated_at,
               r.loss_rate_percent,
               COALESCE(fg.name, fg.code) AS recipe_name
        FROM recipes r
        LEFT JOIN finished_goods fg ON fg.id = r.finished_good_id
        WHERE r.id = $1
      `,
      [recipeId]
    )

    if (recipeResult.rowCount === 0) {
      return null
    }

    const recipeRow = recipeResult.rows[0]
    const itemsResult = await db.query(
      `
        SELECT material_id, qty_per_unit, scrap_ratio
        FROM recipe_items
        WHERE recipe_id = $1
      `,
      [recipeId]
    )

    return {
      id: String(recipeRow.id),
      plantId: String(recipeRow.plant_id),
      finishedGoodId: String(recipeRow.finished_good_id),
      name: String(recipeRow.recipe_name ?? 'Recipe'),
      versionNo: Number(recipeRow.version_no),
      lossRatePercent: Number(recipeRow.loss_rate_percent ?? 0),
      items: itemsResult.rows.map((item) => ({
        materialId: String(item.material_id),
        qtyPerUnit: Number(item.qty_per_unit),
        scrapRatio: Number(item.scrap_ratio ?? 0)
      })),
      updatedAt: new Date(String(recipeRow.updated_at)).toISOString()
    }
  },

  getLatestRecipeByFinishedGood: async (finishedGoodId) => {
    const recipeResult = await db.query(
      `
        SELECT id
        FROM recipes
        WHERE finished_good_id = $1
        ORDER BY version_no DESC, updated_at DESC
        LIMIT 1
      `,
      [finishedGoodId]
    )

    if (recipeResult.rowCount === 0) {
      return null
    }

    return createRecipeRepository(db).getRecipeById(String(recipeResult.rows[0].id))
  },

  getLatestVersionByFinishedGood: async (finishedGoodId) => {
    const result = await db.query(
      `
        SELECT COALESCE(MAX(version_no), 0) AS max_version
        FROM recipes
        WHERE finished_good_id = $1
      `,
      [finishedGoodId]
    )

    return Number(result.rows[0]?.max_version ?? 0)
  },

  saveRecipe: async (recipe) => {
    await db.query(
      `
        INSERT INTO recipes (
          id, plant_id, finished_good_id, version_no, status, effective_from, loss_rate_percent, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'ACTIVE', CURRENT_DATE, $5, now(), now())
        ON CONFLICT (id)
        DO UPDATE SET
          version_no = EXCLUDED.version_no,
          loss_rate_percent = EXCLUDED.loss_rate_percent,
          updated_at = now()
      `,
      [recipe.id, recipe.plantId, recipe.finishedGoodId, recipe.versionNo, recipe.lossRatePercent]
    )

    await db.query('DELETE FROM recipe_items WHERE recipe_id = $1', [recipe.id])

    for (const item of recipe.items) {
      await db.query(
        `
          INSERT INTO recipe_items (id, recipe_id, material_id, qty_per_unit, scrap_ratio)
          VALUES (gen_random_uuid(), $1, $2, $3, $4)
        `,
        [recipe.id, item.materialId, item.qtyPerUnit, item.scrapRatio]
      )
    }
  }
})

const createProductionRepository = (db: DbExecutor): FoodInventoryRepositories['production'] => ({
  saveProductionOrder: async (order) => {
    await db.query(
      `
        INSERT INTO production_orders (
          id, plant_id, warehouse_id, order_no, finished_good_id, recipe_id,
          planned_qty, actual_qty, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
        ON CONFLICT (id)
        DO UPDATE SET
          actual_qty = EXCLUDED.actual_qty,
          status = EXCLUDED.status,
          updated_at = now()
      `,
      [
        order.id,
        order.plantId,
        order.warehouseId,
        order.orderNo,
        order.finishedGoodId,
        order.recipeId,
        order.plannedQty,
        order.actualQty,
        order.status
      ]
    )
  },

  getProductionOrderById: async (orderId) => {
    const result = await db.query(
      `
        SELECT id, plant_id, warehouse_id, order_no, finished_good_id, recipe_id,
               planned_qty, actual_qty, status, created_at
        FROM production_orders
        WHERE id = $1
      `,
      [orderId]
    )

    if (result.rowCount === 0) {
      return null
    }

    return mapProductionOrder(result.rows[0])
  }
})

const createAlertRepository = (db: DbExecutor): FoodInventoryRepositories['alert'] => ({
  saveAlerts: async (alerts) => {
    if (!alerts.length) {
      return
    }

    for (const alert of alerts) {
      await db.query(
        `
          INSERT INTO alerts (
            id, plant_id, warehouse_id, material_id, material_batch_id,
            alert_type, message, status, triggered_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8)
        `,
        [
          alert.id,
          alert.plantId,
          alert.warehouseId,
          alert.materialId,
          alert.batchId ?? null,
          alert.type,
          alert.message,
          alert.triggeredAt
        ]
      )
    }
  }
})

const createSnapshotRepository = (db: DbExecutor): FoodInventoryRepositories['snapshot'] => ({
  saveMonthlySnapshot: async (snapshot) => {
    await db.query(
      `
        INSERT INTO monthly_snapshots (
          id, plant_id, warehouse_id, month_key,
          total_receipt_amount, total_issue_amount, total_disposal_amount,
          ending_inventory_amount, ending_inventory_quantity, generated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3,
          $4, $5, $6,
          $7, $8, now()
        )
        ON CONFLICT (plant_id, warehouse_id, month_key)
        DO UPDATE SET
          total_receipt_amount = EXCLUDED.total_receipt_amount,
          total_issue_amount = EXCLUDED.total_issue_amount,
          total_disposal_amount = EXCLUDED.total_disposal_amount,
          ending_inventory_amount = EXCLUDED.ending_inventory_amount,
          ending_inventory_quantity = EXCLUDED.ending_inventory_quantity,
          generated_at = now()
      `,
      [
        snapshot.plantId,
        snapshot.warehouseId,
        snapshot.monthKey,
        snapshot.totalReceiptAmount,
        snapshot.totalIssueAmount,
        snapshot.totalDisposalAmount,
        snapshot.endingInventoryAmount,
        snapshot.endingInventoryQuantity
      ]
    )
  }
})

export const createPostgresRepositories = (db: DbExecutor): FoodInventoryRepositories => {
  return {
    inventory: createInventoryRepository(db),
    recipe: createRecipeRepository(db),
    production: createProductionRepository(db),
    alert: createAlertRepository(db),
    snapshot: createSnapshotRepository(db)
  }
}
