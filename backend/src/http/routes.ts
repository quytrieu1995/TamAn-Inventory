import { Router } from 'express'
import { z } from 'zod'
import { ConflictError, NotFoundError } from '../core/errors'
import { resolveAuthContextFromRequest } from '../core/http'
import { hashPassword, verifyPassword } from '../core/password'
import { createPostgresRepositories } from '../db/postgres-repositories'
import { withTransaction } from '../db/transaction'
import { createApplicationServices } from '../index'
import { requirePermission, requireWarehouseAccess } from '../modules/auth'
import { asyncHandler } from './async-handler'
import { executeIdempotent } from './idempotency'
import { toSuccessResponse } from './response'
import type { AppServices, RouterDependencies } from './types'

const idSchema = z.string().uuid()

const createTransactionalServices = (dependencies: RouterDependencies, client: Parameters<typeof createPostgresRepositories>[0]) => {
  const repositories = createPostgresRepositories(client)
  return createApplicationServices(repositories)
}

const runInTransaction = async <T>(
  dependencies: RouterDependencies,
  callback: (services: AppServices) => Promise<T>
) => {
  return withTransaction(dependencies.pool, async (client) => {
    const transactionalServices = createTransactionalServices(dependencies, client)
    return callback(transactionalServices)
  })
}

const getProductionOrderStatusLabel = (status: string) => {
  if (status === 'COMPLETED') {
    return 'Hoàn thành'
  }

  if (status === 'RELEASED' || status === 'IN_PROGRESS') {
    return 'Đã duyệt'
  }

  return 'Chờ xét duyệt'
}

const getAlertRunStatusLabel = (status: string) => {
  if (status === 'ok') {
    return 'Thành công'
  }

  return 'Không xác định'
}

const getAlertTypeLabel = (type: string) => {
  if (type === 'LOW_STOCK') {
    return 'Tồn dưới mức tối thiểu'
  }

  if (type === 'OVER_STORAGE_DAYS') {
    return 'Vượt số ngày lưu kho'
  }

  return type
}

const getMovementTypeLabel = (movementType: string) => {
  if (movementType === 'RECEIPT') {
    return 'Nhập kho'
  }

  if (movementType === 'ISSUE') {
    return 'Xuất kho'
  }

  if (movementType === 'DISPOSAL') {
    return 'Hủy kho'
  }

  if (movementType === 'PRODUCTION_CONSUME') {
    return 'Tiêu hao sản xuất'
  }

  if (movementType === 'PRODUCTION_OUTPUT') {
    return 'Nhập thành phẩm'
  }

  if (movementType === 'ADJUSTMENT_PLUS') {
    return 'Điều chỉnh tăng'
  }

  if (movementType === 'ADJUSTMENT_MINUS') {
    return 'Điều chỉnh giảm'
  }

  if (movementType === 'TRANSFER_OUT') {
    return 'Xuất chuyển kho'
  }

  if (movementType === 'TRANSFER_IN') {
    return 'Nhập chuyển kho'
  }

  return movementType
}

const getReferenceTypeLabel = (referenceType: string) => {
  if (referenceType === 'PURCHASE_RECEIPT') {
    return 'Phiếu nhập mua hàng'
  }

  if (referenceType === 'MANUAL_ISSUE') {
    return 'Phiếu xuất thủ công'
  }

  if (referenceType === 'DISPOSAL') {
    return 'Phiếu hủy'
  }

  if (referenceType === 'PRODUCTION') {
    return 'Lệnh sản xuất - tiêu hao'
  }

  if (referenceType === 'PRODUCTION_ORDER') {
    return 'Lệnh sản xuất - thành phẩm'
  }

  if (referenceType === 'ADJUSTMENT') {
    return 'Phiếu điều chỉnh'
  }

  if (referenceType === 'FG_MANUAL_RECEIPT') {
    return 'Phiếu nhập thành phẩm thủ công'
  }

  if (referenceType === 'FG_MANUAL_ISSUE') {
    return 'Phiếu xuất thành phẩm thủ công'
  }

  return referenceType
}

const toInventoryMovementResponse = <T extends { movementType: string, referenceType: string }>(movement: T) => ({
  ...movement,
  movementTypeLabel: getMovementTypeLabel(movement.movementType),
  referenceTypeLabel: getReferenceTypeLabel(movement.referenceType)
})

const toProductionOrderResponse = (order: {
  id: string
  orderNo: string
  finishedGoodId: string
  recipeId: string
  plannedQty: number
  actualQty: number
  status: string
  warehouseId: string
  createdAt: string
}) => ({
  ...order,
  statusLabel: getProductionOrderStatusLabel(order.status)
})

export const createRouter = (dependencies: RouterDependencies) => {
  const router = Router()
  const { services, pool } = dependencies
  const getAuthContext = (request: Parameters<typeof resolveAuthContextFromRequest>[0]) => {
    return resolveAuthContextFromRequest(request, pool)
  }

  router.post('/auth/login', asyncHandler(async (request, response) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6)
    })
    const payload = schema.parse(request.body)

    const userResult = await pool.query(
      `
        SELECT id, email, full_name, password_hash, is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [payload.email]
    )

    if (userResult.rowCount === 0) {
      throw new ConflictError('Email hoặc mật khẩu không đúng')
    }

    const user = userResult.rows[0]
    if (!Boolean(user.is_active)) {
      throw new ConflictError('Tài khoản đã bị khoá')
    }

    const validPassword = verifyPassword(payload.password, String(user.password_hash))
    if (!validPassword) {
      throw new ConflictError('Email hoặc mật khẩu không đúng')
    }

    return response.json(toSuccessResponse({
      userId: String(user.id),
      email: String(user.email),
      fullName: String(user.full_name)
    }))
  }))

  router.get('/auth/me', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const profileResult = await pool.query(
      `
        SELECT id, email, full_name
        FROM users
        WHERE id = $1
      `,
      [auth.userId]
    )
    const profile = profileResult.rows[0]

    const rolesResult = await pool.query(
      `
        SELECT DISTINCT r.code
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
          AND (ur.plant_id IS NULL OR ur.plant_id = $2)
        ORDER BY r.code ASC
      `,
      [auth.userId, auth.plantId]
    )

    return response.json(toSuccessResponse({
      ...auth,
      profile: profile
        ? {
          id: String(profile.id),
          email: String(profile.email),
          fullName: String(profile.full_name)
        }
        : null,
      roles: rolesResult.rows.map((row) => String(row.code))
    }))
  }))

  router.get('/recipes/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const recipe = await services.recipeService.getRecipeById(auth, String(request.params.id))
    return response.json(toSuccessResponse(recipe))
  }))

  router.put('/auth/password', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      currentPassword: z.string().min(6),
      newPassword: z.string().min(6)
    })
    const payload = schema.parse(request.body)

    const userResult = await pool.query(
      `
        SELECT password_hash
        FROM users
        WHERE id = $1
      `,
      [auth.userId]
    )
    if (userResult.rowCount === 0) {
      throw new NotFoundError('User')
    }

    const currentHash = String(userResult.rows[0].password_hash)
    if (!verifyPassword(payload.currentPassword, currentHash)) {
      throw new ConflictError('Mật khẩu hiện tại không đúng')
    }

    await pool.query(
      `
        UPDATE users
        SET password_hash = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [auth.userId, hashPassword(payload.newPassword)]
    )

    return response.json(toSuccessResponse({ updated: true }))
  }))

  router.get('/suppliers', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const result = await pool.query(
      `
        SELECT id, code, name, contact_name, phone, email, payment_terms
        FROM suppliers
        WHERE plant_id = $1
        ORDER BY code ASC
      `,
      [auth.plantId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      contactName: row.contact_name ? String(row.contact_name) : '',
      phone: row.phone ? String(row.phone) : '',
      email: row.email ? String(row.email) : '',
      paymentTerms: row.payment_terms ? String(row.payment_terms) : ''
    }))))
  }))

  router.get('/suppliers/:id/receipts', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'supplier.manage')
    const supplierId = String(request.params.id)

    const supplierResult = await pool.query(
      `
        SELECT id, code, name, contact_name, phone, email, payment_terms
        FROM suppliers
        WHERE id = $1
          AND plant_id = $2
      `,
      [supplierId, auth.plantId]
    )

    if (supplierResult.rowCount === 0) {
      throw new NotFoundError('Supplier')
    }

    const receiptsResult = await pool.query(
      `
        SELECT
          pr.id,
          pr.receipt_no,
          pr.received_at,
          pr.note,
          pr.warehouse_id,
          COALESCE(SUM(pri.quantity), 0) AS total_quantity,
          COALESCE(SUM(pri.quantity * pri.unit_price), 0) AS total_amount,
          COUNT(pri.id)::int AS item_count
        FROM purchase_receipts pr
        LEFT JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
        WHERE pr.plant_id = $1
          AND pr.supplier_id = $2
        GROUP BY pr.id, pr.receipt_no, pr.received_at, pr.note, pr.warehouse_id
        ORDER BY pr.received_at DESC
      `,
      [auth.plantId, supplierId]
    )

    const supplierRow = supplierResult.rows[0]
    return response.json(toSuccessResponse({
      supplier: {
        id: String(supplierRow.id),
        code: String(supplierRow.code),
        name: String(supplierRow.name),
        contactName: supplierRow.contact_name ? String(supplierRow.contact_name) : '',
        phone: supplierRow.phone ? String(supplierRow.phone) : '',
        email: supplierRow.email ? String(supplierRow.email) : '',
        paymentTerms: supplierRow.payment_terms ? String(supplierRow.payment_terms) : ''
      },
      receipts: receiptsResult.rows.map((row) => ({
        id: String(row.id),
        receiptNo: String(row.receipt_no),
        receivedAt: new Date(String(row.received_at)).toISOString(),
        note: row.note ? String(row.note) : '',
        warehouseId: String(row.warehouse_id),
        itemCount: Number(row.item_count),
        totalQuantity: Number(row.total_quantity),
        totalAmount: Number(row.total_amount)
      }))
    }))
  }))

  router.get('/purchase-receipts/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'supplier.manage')
    const receiptId = String(request.params.id)

    const receiptResult = await pool.query(
      `
        SELECT
          pr.id,
          pr.receipt_no,
          pr.received_at,
          pr.note,
          pr.warehouse_id,
          pr.supplier_id,
          s.code AS supplier_code,
          s.name AS supplier_name
        FROM purchase_receipts pr
        INNER JOIN suppliers s ON s.id = pr.supplier_id
        WHERE pr.id = $1
          AND pr.plant_id = $2
      `,
      [receiptId, auth.plantId]
    )

    if (receiptResult.rowCount === 0) {
      throw new NotFoundError('Purchase receipt')
    }

    const itemsResult = await pool.query(
      `
        SELECT
          pri.id,
          pri.material_id,
          m.code AS material_code,
          m.name AS material_name,
          m.uom AS material_uom,
          pri.batch_no,
          pri.quantity,
          pri.unit_price,
          (pri.quantity * pri.unit_price) AS line_total
        FROM purchase_receipt_items pri
        INNER JOIN materials m ON m.id = pri.material_id
        WHERE pri.receipt_id = $1
        ORDER BY m.code ASC
      `,
      [receiptId]
    )

    const receiptRow = receiptResult.rows[0]
    return response.json(toSuccessResponse({
      id: String(receiptRow.id),
      receiptNo: String(receiptRow.receipt_no),
      receivedAt: new Date(String(receiptRow.received_at)).toISOString(),
      note: receiptRow.note ? String(receiptRow.note) : '',
      warehouseId: String(receiptRow.warehouse_id),
      supplier: {
        id: String(receiptRow.supplier_id),
        code: String(receiptRow.supplier_code),
        name: String(receiptRow.supplier_name)
      },
      items: itemsResult.rows.map((row) => ({
        id: String(row.id),
        materialId: String(row.material_id),
        materialCode: String(row.material_code),
        materialName: String(row.material_name),
        materialUom: String(row.material_uom),
        batchNo: String(row.batch_no),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        lineTotal: Number(row.line_total)
      }))
    }))
  }))

  router.post('/suppliers', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'supplier.manage')
    const schema = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      contactName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      paymentTerms: z.string().optional()
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        INSERT INTO suppliers (id, plant_id, code, name, contact_name, phone, email, payment_terms)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        RETURNING id, code, name, contact_name, phone, email, payment_terms
      `,
      [
        auth.plantId,
        payload.code,
        payload.name,
        payload.contactName ?? null,
        payload.phone ?? null,
        payload.email ?? null,
        payload.paymentTerms ?? null
      ]
    )

    const created = result.rows[0]
    return response.status(201).json(toSuccessResponse({
      id: String(created.id),
      code: String(created.code),
      name: String(created.name),
      contactName: created.contact_name ? String(created.contact_name) : '',
      phone: created.phone ? String(created.phone) : '',
      email: created.email ? String(created.email) : '',
      paymentTerms: created.payment_terms ? String(created.payment_terms) : ''
    }))
  }))

  router.put('/suppliers/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'supplier.manage')
    const schema = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      contactName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      paymentTerms: z.string().optional()
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        UPDATE suppliers
        SET code = $3,
            name = $4,
            contact_name = $5,
            phone = $6,
            email = $7,
            payment_terms = $8,
            updated_at = now()
        WHERE id = $1
          AND plant_id = $2
        RETURNING id, code, name, contact_name, phone, email, payment_terms
      `,
      [
        String(request.params.id),
        auth.plantId,
        payload.code,
        payload.name,
        payload.contactName ?? null,
        payload.phone ?? null,
        payload.email ?? null,
        payload.paymentTerms ?? null
      ]
    )

    return response.json(toSuccessResponse(result.rows[0] ?? null))
  }))

  router.delete('/suppliers/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'supplier.manage')
    await pool.query(
      `
        DELETE FROM suppliers
        WHERE id = $1
          AND plant_id = $2
      `,
      [String(request.params.id), auth.plantId]
    )
    return response.json(toSuccessResponse({ deleted: true }))
  }))

  router.post('/materials', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'material.manage')
    const schema = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      uom: z.string().min(1),
      minimumStock: z.number().nonnegative(),
      maxStorageDays: z.number().int().nonnegative()
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        INSERT INTO materials (id, plant_id, code, name, uom, minimum_stock, max_storage_days)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        RETURNING id, code, name, uom, minimum_stock, max_storage_days, is_active
      `,
      [auth.plantId, payload.code, payload.name, payload.uom, payload.minimumStock, payload.maxStorageDays]
    )

    const row = result.rows[0]
    return response.status(201).json(toSuccessResponse({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      uom: String(row.uom),
      minimumStock: Number(row.minimum_stock),
      maxStorageDays: Number(row.max_storage_days),
      isActive: Boolean(row.is_active)
    }))
  }))

  router.put('/materials/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'material.manage')
    const schema = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      uom: z.string().min(1),
      minimumStock: z.number().nonnegative(),
      maxStorageDays: z.number().int().nonnegative()
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        UPDATE materials
        SET code = $3,
            name = $4,
            uom = $5,
            minimum_stock = $6,
            max_storage_days = $7,
            updated_at = now()
        WHERE id = $1
          AND plant_id = $2
        RETURNING id, code, name, uom, minimum_stock, max_storage_days, is_active
      `,
      [String(request.params.id), auth.plantId, payload.code, payload.name, payload.uom, payload.minimumStock, payload.maxStorageDays]
    )

    if (result.rowCount === 0) {
      return response.json(toSuccessResponse(null))
    }
    const row = result.rows[0]
    return response.json(toSuccessResponse({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      uom: String(row.uom),
      minimumStock: Number(row.minimum_stock),
      maxStorageDays: Number(row.max_storage_days),
      isActive: Boolean(row.is_active)
    }))
  }))

  router.put('/materials/:id/status', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'material.manage')
    const schema = z.object({
      isActive: z.boolean()
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        UPDATE materials
        SET is_active = $3,
            updated_at = now()
        WHERE id = $1
          AND plant_id = $2
        RETURNING id, is_active
      `,
      [String(request.params.id), auth.plantId, payload.isActive]
    )

    return response.json(toSuccessResponse({
      id: result.rows[0] ? String(result.rows[0].id) : String(request.params.id),
      isActive: result.rows[0] ? Boolean(result.rows[0].is_active) : payload.isActive
    }))
  }))

  router.delete('/materials/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'material.manage')
    await pool.query(
      `
        DELETE FROM materials
        WHERE id = $1
          AND plant_id = $2
      `,
      [String(request.params.id), auth.plantId]
    )

    return response.json(toSuccessResponse({ deleted: true }))
  }))

  router.delete('/finished-goods/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'recipe.manage')
    const finishedGoodId = String(request.params.id)

    await withTransaction(pool, async (client) => {
      const existing = await client.query(
        `
          SELECT id
          FROM finished_goods
          WHERE id = $1
            AND plant_id = $2
        `,
        [finishedGoodId, auth.plantId]
      )

      if (existing.rowCount === 0) {
        throw new NotFoundError('Finished good')
      }

      const productionUsage = await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM production_orders
          WHERE finished_good_id = $1
        `,
        [finishedGoodId]
      )

      if (Number(productionUsage.rows[0]?.count ?? 0) > 0) {
        throw new ConflictError('Không thể xoá sản phẩm đã phát sinh lệnh sản xuất')
      }

      const movementUsage = await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM stock_movements
          WHERE finished_good_id = $1
        `,
        [finishedGoodId]
      )

      if (Number(movementUsage.rows[0]?.count ?? 0) > 0) {
        throw new ConflictError('Không thể xoá sản phẩm đã phát sinh xuất nhập kho thành phẩm')
      }

      await client.query('DELETE FROM recipes WHERE finished_good_id = $1', [finishedGoodId])
      await client.query('DELETE FROM finished_goods WHERE id = $1 AND plant_id = $2', [finishedGoodId, auth.plantId])
    })

    return response.json(toSuccessResponse({ deleted: true }))
  }))

  router.put('/finished-goods/:id/status', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'recipe.manage')
    const schema = z.object({
      isActive: z.boolean()
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        UPDATE finished_goods
        SET is_active = $3,
            updated_at = now()
        WHERE id = $1
          AND plant_id = $2
        RETURNING id, is_active
      `,
      [String(request.params.id), auth.plantId, payload.isActive]
    )

    return response.json(toSuccessResponse({
      id: result.rows[0] ? String(result.rows[0].id) : String(request.params.id),
      isActive: result.rows[0] ? Boolean(result.rows[0].is_active) : payload.isActive
    }))
  }))

  router.post('/recipes', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      id: idSchema,
      name: z.string().min(1),
      product: z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        uom: z.string().min(1)
      }),
      items: z.array(z.object({
        materialId: idSchema,
        qtyPerUnit: z.number().positive()
      })).min(1)
    })

    const payload = schema.parse(request.body)

    const recipe = await withTransaction(pool, async (client) => {
      const transactionalServices = createTransactionalServices(dependencies, client)
      const finishedGoodResult = await client.query(
        `
          INSERT INTO finished_goods (id, plant_id, code, name, uom, is_active, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, true, now(), now())
          RETURNING id
        `,
        [auth.plantId, payload.product.code, payload.product.name, payload.product.uom]
      )

      return transactionalServices.recipeService.createRecipe(auth, {
        id: payload.id,
        plantId: auth.plantId,
        finishedGoodId: String(finishedGoodResult.rows[0].id),
        name: payload.name,
        items: payload.items
      })
    })

    return response.status(201).json(toSuccessResponse(recipe))
  }))

  router.put('/recipes/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      name: z.string().min(1),
      productName: z.string().min(1).optional(),
      items: z.array(z.object({
        materialId: idSchema,
        qtyPerUnit: z.number().positive()
      })).min(1)
    })

    const input = schema.parse(request.body)
    const recipe = await withTransaction(pool, async (client) => {
      const transactionalServices = createTransactionalServices(dependencies, client)
      const updatedRecipe = await transactionalServices.recipeService.updateRecipe(auth, String(request.params.id), input)

      if (input.productName) {
        await client.query(
          `
            UPDATE finished_goods
            SET name = $3,
                updated_at = now()
            WHERE id = $1
              AND plant_id = $2
          `,
          [updatedRecipe.finishedGoodId, auth.plantId, input.productName]
        )
      }

      return updatedRecipe
    })

    return response.json(toSuccessResponse(recipe))
  }))

  router.post('/inventory/receipts', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      receiptId: idSchema,
      receiptNo: z.string().min(1),
      supplierId: idSchema,
      warehouseId: idSchema,
      receivedAt: z.string().datetime(),
      note: z.string().optional(),
      items: z.array(z.object({
        materialId: idSchema,
        batchNo: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative()
      })).min(1)
    })

    const payload = schema.parse(request.body)

    const result = await executeIdempotent(pool, request, '/inventory/receipts', async (client) => {
      await client.query(
        `
          INSERT INTO purchase_receipts (id, plant_id, warehouse_id, supplier_id, receipt_no, received_at, note, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
        `,
        [
          payload.receiptId,
          auth.plantId,
          payload.warehouseId,
          payload.supplierId,
          payload.receiptNo,
          payload.receivedAt,
          payload.note ?? null
        ]
      )

      for (const item of payload.items) {
        await client.query(
          `
            INSERT INTO purchase_receipt_items (id, receipt_id, material_id, batch_no, quantity, unit_price)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
          `,
          [payload.receiptId, item.materialId, item.batchNo, item.quantity, item.unitPrice]
        )
      }

      const transactionalServices = createTransactionalServices(dependencies, client)
      const data = await transactionalServices.inventoryService.receiveMaterials(auth, payload)
      return {
        statusCode: 201,
        body: toSuccessResponse({
          ...data,
          movements: data.movements.map((movement) => toInventoryMovementResponse(movement))
        })
      }
    })

    return response.status(result.statusCode).json(result.body)
  }))

  router.post('/inventory/issues', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema,
      referenceType: z.string().min(1),
      referenceId: idSchema,
      movedAt: z.string().datetime(),
      items: z.array(z.object({
        materialId: idSchema,
        quantity: z.number().positive()
      })).min(1)
    })

    const payload = schema.parse(request.body)

    const result = await executeIdempotent(pool, request, '/inventory/issues', async (client) => {
      const transactionalServices = createTransactionalServices(dependencies, client)
      const data = await transactionalServices.inventoryService.issueMaterialsFifo(auth, payload)
      return {
        statusCode: 200,
        body: toSuccessResponse({
          ...data,
          movements: data.movements.map((movement) => toInventoryMovementResponse(movement))
        })
      }
    })

    return response.status(result.statusCode).json(result.body)
  }))

  router.post('/inventory/disposals', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'inventory.adjust')
    const schema = z.object({
      warehouseId: idSchema,
      referenceId: idSchema,
      movedAt: z.string().datetime(),
      items: z.array(z.object({
        materialId: idSchema,
        quantity: z.number().positive()
      })).min(1)
    })

    const payload = schema.parse(request.body)
    const result = await executeIdempotent(pool, request, '/inventory/disposals', async (client) => {
      const transactionalServices = createTransactionalServices(dependencies, client)
      const data = await transactionalServices.inventoryService.issueMaterialsFifo(auth, {
        ...payload,
        referenceType: 'DISPOSAL'
      })
      return {
        statusCode: 200,
        body: toSuccessResponse({
          ...data,
          movements: data.movements.map((movement) => toInventoryMovementResponse(movement))
        })
      }
    })

    return response.status(result.statusCode).json(result.body)
  }))

  router.post('/inventory/adjustments', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema,
      materialId: idSchema,
      batchId: idSchema.optional(),
      quantity: z.number().refine((value) => value !== 0, 'Quantity must be non-zero'),
      reason: z.string().min(1),
      referenceId: idSchema,
      movedAt: z.string().datetime()
    })

    const payload = schema.parse(request.body)

    const movement = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.inventoryService.adjustInventory(auth, payload)
    })

    return response.json(toSuccessResponse(toInventoryMovementResponse(movement)))
  }))

  router.get('/inventory/ledger', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    const ledger = await services.inventoryService.getWarehouseLedger(auth, query.warehouseId)
    return response.json(toSuccessResponse(ledger.map((movement) => toInventoryMovementResponse(movement))))
  }))

  router.get('/inventory/stocks', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    const stocks = await services.inventoryService.getMaterialStocks(auth, query.warehouseId)
    return response.json(toSuccessResponse(stocks))
  }))

  router.get('/inventory/finished-goods/stocks', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    requireWarehouseAccess(auth, query.warehouseId)

    const result = await pool.query(
      `
        SELECT
          fg.id AS finished_good_id,
          fg.code AS finished_good_code,
          fg.name AS finished_good_name,
          fg.uom AS finished_good_uom,
          COALESCE(SUM(sm.direction * sm.quantity), 0)::numeric(16,3) AS quantity_on_hand
        FROM finished_goods fg
        LEFT JOIN stock_movements sm
          ON sm.finished_good_id = fg.id
          AND sm.warehouse_id = $2
        WHERE fg.plant_id = $1
        GROUP BY fg.id, fg.code, fg.name, fg.uom
        HAVING COALESCE(SUM(sm.direction * sm.quantity), 0) > 0
        ORDER BY fg.code ASC
      `,
      [auth.plantId, query.warehouseId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      finishedGoodId: String(row.finished_good_id),
      code: String(row.finished_good_code),
      name: String(row.finished_good_name),
      uom: String(row.finished_good_uom),
      quantityOnHand: Number(row.quantity_on_hand)
    }))))
  }))

  router.post('/inventory/finished-goods/receipts', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'inventory.receive')
    const schema = z.object({
      warehouseId: idSchema,
      finishedGoodId: idSchema,
      quantity: z.number().positive(),
      unitCost: z.number().nonnegative(),
      movedAt: z.string().datetime(),
      referenceId: idSchema,
      referenceType: z.string().min(1).optional()
    })
    const payload = schema.parse(request.body)
    requireWarehouseAccess(auth, payload.warehouseId)

    const movementResult = await pool.query(
      `
        INSERT INTO stock_movements (
          id, plant_id, warehouse_id, finished_good_id,
          movement_type, direction, quantity, unit_cost,
          reference_type, reference_id, moved_at, created_at
        )
        VALUES (gen_random_uuid(), $1, $2, $3, 'RECEIPT', 1, $4, $5, $6, $7, $8, now())
        RETURNING id, plant_id, warehouse_id, material_id, finished_good_id, material_batch_id,
                  movement_type, direction, quantity, unit_cost, reference_type, reference_id, moved_at
      `,
      [
        auth.plantId,
        payload.warehouseId,
        payload.finishedGoodId,
        payload.quantity,
        payload.unitCost,
        payload.referenceType ?? 'FG_MANUAL_RECEIPT',
        payload.referenceId,
        payload.movedAt
      ]
    )

    return response.status(201).json(toSuccessResponse(toInventoryMovementResponse({
      id: String(movementResult.rows[0].id),
      plantId: String(movementResult.rows[0].plant_id),
      warehouseId: String(movementResult.rows[0].warehouse_id),
      materialId: movementResult.rows[0].material_id ? String(movementResult.rows[0].material_id) : undefined,
      finishedGoodId: movementResult.rows[0].finished_good_id ? String(movementResult.rows[0].finished_good_id) : undefined,
      batchId: movementResult.rows[0].material_batch_id ? String(movementResult.rows[0].material_batch_id) : undefined,
      movementType: String(movementResult.rows[0].movement_type),
      direction: Number(movementResult.rows[0].direction) as -1 | 1,
      quantity: Number(movementResult.rows[0].quantity),
      unitCost: Number(movementResult.rows[0].unit_cost),
      referenceType: String(movementResult.rows[0].reference_type),
      referenceId: String(movementResult.rows[0].reference_id),
      movedAt: new Date(String(movementResult.rows[0].moved_at)).toISOString()
    })))
  }))

  router.post('/inventory/finished-goods/issues', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'inventory.issue')
    const schema = z.object({
      warehouseId: idSchema,
      finishedGoodId: idSchema,
      quantity: z.number().positive(),
      unitCost: z.number().nonnegative(),
      movedAt: z.string().datetime(),
      referenceId: idSchema,
      referenceType: z.string().min(1).optional()
    })
    const payload = schema.parse(request.body)
    requireWarehouseAccess(auth, payload.warehouseId)

    const stockCheck = await pool.query(
      `
        SELECT COALESCE(SUM(direction * quantity), 0)::numeric(16,3) AS quantity_on_hand
        FROM stock_movements
        WHERE plant_id = $1
          AND warehouse_id = $2
          AND finished_good_id = $3
      `,
      [auth.plantId, payload.warehouseId, payload.finishedGoodId]
    )
    const quantityOnHand = Number(stockCheck.rows[0]?.quantity_on_hand ?? 0)
    if (quantityOnHand < payload.quantity) {
      throw new ConflictError(`Tồn thành phẩm không đủ. Hiện có ${quantityOnHand}`)
    }

    const movementResult = await pool.query(
      `
        INSERT INTO stock_movements (
          id, plant_id, warehouse_id, finished_good_id,
          movement_type, direction, quantity, unit_cost,
          reference_type, reference_id, moved_at, created_at
        )
        VALUES (gen_random_uuid(), $1, $2, $3, 'ISSUE', -1, $4, $5, $6, $7, $8, now())
        RETURNING id, plant_id, warehouse_id, material_id, finished_good_id, material_batch_id,
                  movement_type, direction, quantity, unit_cost, reference_type, reference_id, moved_at
      `,
      [
        auth.plantId,
        payload.warehouseId,
        payload.finishedGoodId,
        payload.quantity,
        payload.unitCost,
        payload.referenceType ?? 'FG_MANUAL_ISSUE',
        payload.referenceId,
        payload.movedAt
      ]
    )

    return response.status(201).json(toSuccessResponse(toInventoryMovementResponse({
      id: String(movementResult.rows[0].id),
      plantId: String(movementResult.rows[0].plant_id),
      warehouseId: String(movementResult.rows[0].warehouse_id),
      materialId: movementResult.rows[0].material_id ? String(movementResult.rows[0].material_id) : undefined,
      finishedGoodId: movementResult.rows[0].finished_good_id ? String(movementResult.rows[0].finished_good_id) : undefined,
      batchId: movementResult.rows[0].material_batch_id ? String(movementResult.rows[0].material_batch_id) : undefined,
      movementType: String(movementResult.rows[0].movement_type),
      direction: Number(movementResult.rows[0].direction) as -1 | 1,
      quantity: Number(movementResult.rows[0].quantity),
      unitCost: Number(movementResult.rows[0].unit_cost),
      referenceType: String(movementResult.rows[0].reference_type),
      referenceId: String(movementResult.rows[0].reference_id),
      movedAt: new Date(String(movementResult.rows[0].moved_at)).toISOString()
    })))
  }))

  router.get('/master/materials', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const result = await pool.query(
      `
        SELECT id, code, name, uom, minimum_stock, max_storage_days, is_active
        FROM materials
        WHERE plant_id = $1
        ORDER BY code ASC
      `,
      [auth.plantId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      uom: String(row.uom),
      minimumStock: Number(row.minimum_stock),
      maxStorageDays: Number(row.max_storage_days),
      isActive: Boolean(row.is_active)
    }))))
  }))

  router.get('/master/suppliers', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const result = await pool.query(
      `
        SELECT id, code, name
        FROM suppliers
        WHERE plant_id = $1
        ORDER BY code ASC
      `,
      [auth.plantId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name)
    }))))
  }))

  router.get('/master/finished-goods', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const result = await pool.query(
      `
        SELECT id, code, name, uom, is_active
        FROM finished_goods
        WHERE plant_id = $1
        ORDER BY code ASC
      `,
      [auth.plantId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      uom: String(row.uom),
      isActive: Boolean(row.is_active)
    }))))
  }))

  router.get('/master/recipes', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'recipe.view')
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.finished_good_id,
          r.version_no,
          COALESCE(fg.name, fg.code) AS name,
          fg.code AS product_code,
          fg.name AS product_name,
          fg.is_active AS product_is_active
        FROM recipes r
        LEFT JOIN finished_goods fg ON fg.id = r.finished_good_id
        WHERE r.plant_id = $1
        ORDER BY r.updated_at DESC
      `,
      [auth.plantId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      finishedGoodId: String(row.finished_good_id),
      versionNo: Number(row.version_no),
      name: String(row.name),
      productCode: row.product_code ? String(row.product_code) : '',
      productName: row.product_name ? String(row.product_name) : '',
      productIsActive: Boolean(row.product_is_active)
    }))))
  }))

  router.get('/production-orders', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema.optional()
    })
    const query = schema.parse(request.query)

    const result = await pool.query(
      `
        SELECT id, order_no, finished_good_id, recipe_id, planned_qty, actual_qty, status, created_at, warehouse_id
        FROM production_orders
        WHERE plant_id = $1
          AND ($2::uuid IS NULL OR warehouse_id = $2)
        ORDER BY created_at DESC
      `,
      [auth.plantId, query.warehouseId ?? null]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => {
      return toProductionOrderResponse({
        id: String(row.id),
        orderNo: String(row.order_no),
        finishedGoodId: String(row.finished_good_id),
        recipeId: String(row.recipe_id),
        plannedQty: Number(row.planned_qty),
        actualQty: Number(row.actual_qty),
        status: String(row.status),
        warehouseId: String(row.warehouse_id),
        createdAt: new Date(String(row.created_at)).toISOString()
      })
    })))
  }))

  router.post('/production-orders', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema,
      orderNo: z.string().min(1),
      finishedGoodId: idSchema,
      plannedQty: z.number().positive()
    })

    const payload = schema.parse(request.body)
    const order = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.finishedGoodsService.createProductionOrder(auth, payload)
    })

    return response.status(201).json(toSuccessResponse(toProductionOrderResponse(order)))
  }))

  router.post('/production-orders/:id/approve', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const result = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.finishedGoodsService.approveProductionOrder(auth, {
        orderId: String(request.params.id)
      })
    })

    return response.json(toSuccessResponse(toProductionOrderResponse(result)))
  }))

  router.post('/production-orders/:id/complete', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      actualQty: z.number().positive(),
      movedAt: z.string().datetime(),
      outputUnitCost: z.number().nonnegative()
    })

    const payload = schema.parse(request.body)
    const result = await executeIdempotent(pool, request, '/production-orders/complete', async (client) => {
      const transactionalServices = createTransactionalServices(dependencies, client)
      const data = await transactionalServices.finishedGoodsService.completeProductionOrder(auth, {
        orderId: String(request.params.id),
        actualQty: payload.actualQty,
        movedAt: payload.movedAt,
        outputUnitCost: payload.outputUnitCost
      })

      return {
        statusCode: 200,
        body: toSuccessResponse({
          ...data,
          order: toProductionOrderResponse(data.order),
          movement: toInventoryMovementResponse(data.movement),
          consumption: {
            ...data.consumption,
            movements: data.consumption.movements.map((movement) => toInventoryMovementResponse(movement))
          }
        })
      }
    })

    return response.status(result.statusCode).json(result.body)
  }))

  router.get('/reports/dashboard', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema
    })

    const report = await services.reportService.getDashboard(auth, schema.parse(request.query).warehouseId)
    return response.json(toSuccessResponse(report))
  }))

  router.get('/reports/monthly', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/),
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    const summary = await services.reportService.getMonthlySummary(auth, query)
    return response.json(toSuccessResponse(summary))
  }))

  router.post('/reports/monthly-snapshot/rebuild', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/),
      warehouseId: idSchema
    })

    const payload = schema.parse(request.body)
    const snapshot = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.reportService.buildMonthlySnapshot(auth, payload)
    })

    return response.json(toSuccessResponse(snapshot))
  }))

  router.post('/alerts/run', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema,
      materialIds: z.array(idSchema).min(1),
      mailTo: z.array(z.string().email()).min(1)
    })

    const payload = schema.parse(request.body)
    const result = await services.alertWorker.run({
      plantId: auth.plantId,
      warehouseId: payload.warehouseId,
      materialIds: payload.materialIds,
      mailTo: payload.mailTo
    })

    return response.json(toSuccessResponse({
      ...result,
      alerts: result.alerts.map((alert) => ({
        ...alert,
        typeLabel: getAlertTypeLabel(alert.type)
      })),
      statusLabel: getAlertRunStatusLabel(result.status)
    }))
  }))

  router.get('/admin/roles', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.code,
          r.name,
          COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        GROUP BY r.id, r.code, r.name
        ORDER BY r.code ASC
      `
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      permissions: Array.isArray(row.permissions) ? row.permissions.map((value: unknown) => String(value)) : []
    }))))
  }))

  router.get('/admin/users', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    const result = await pool.query(
      `
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.is_active,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'roleId', r.id,
                'roleCode', r.code,
                'roleName', r.name,
                'plantId', ur.plant_id,
                'warehouseId', ur.warehouse_id
              )
            ) FILTER (WHERE r.id IS NOT NULL),
            '[]'::json
          ) AS assignments
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        GROUP BY u.id, u.email, u.full_name, u.is_active
        ORDER BY u.created_at DESC
      `
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      fullName: String(row.full_name),
      isActive: Boolean(row.is_active),
      assignments: Array.isArray(row.assignments) ? row.assignments : []
    }))))
  }))

  router.post('/admin/users', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    const schema = z.object({
      email: z.string().email(),
      fullName: z.string().min(1),
      password: z.string().min(6).optional()
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        INSERT INTO users (id, email, full_name, password_hash, is_active)
        VALUES (gen_random_uuid(), $1, $2, $3, true)
        RETURNING id, email, full_name, is_active
      `,
      [payload.email, payload.fullName, hashPassword(payload.password ?? '123456')]
    )

    const created = result.rows[0]
    return response.status(201).json(toSuccessResponse({
      id: String(created.id),
      email: String(created.email),
      fullName: String(created.full_name),
      isActive: Boolean(created.is_active)
    }))
  }))

  router.put('/admin/users/:id/roles', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    const schema = z.object({
      assignments: z.array(z.object({
        roleId: idSchema,
        plantId: idSchema.nullable().optional(),
        warehouseId: idSchema.optional()
      }))
    })
    const payload = schema.parse(request.body)

    await withTransaction(pool, async (client) => {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [String(request.params.id)])
      for (const assignment of payload.assignments) {
        const resolvedWarehouseId = assignment.warehouseId ?? auth.warehouseIds[0]
        if (!resolvedWarehouseId) {
          throw new Error('Warehouse scope is required for user role assignment')
        }

        await client.query(
          `
            INSERT INTO user_roles (user_id, role_id, plant_id, warehouse_id)
            VALUES ($1, $2, $3, $4)
          `,
          [
            String(request.params.id),
            assignment.roleId,
            assignment.plantId ?? auth.plantId,
            resolvedWarehouseId
          ]
        )
      }
    })

    return response.json(toSuccessResponse({ userId: String(request.params.id), updated: true }))
  }))

  router.put('/admin/users/:id/password', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    const schema = z.object({
      newPassword: z.string().min(6)
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        UPDATE users
        SET password_hash = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [String(request.params.id), hashPassword(payload.newPassword)]
    )

    if (result.rowCount === 0) {
      throw new NotFoundError('User')
    }

    return response.json(toSuccessResponse({ userId: String(result.rows[0].id), updated: true }))
  }))

  return router
}
