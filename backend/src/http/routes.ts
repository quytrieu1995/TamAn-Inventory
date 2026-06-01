import { Router } from 'express'
import { z } from 'zod'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors'
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
const finishedGoodUomSchema = z.string()
  .trim()
  .toLowerCase()
  .refine((value) => ['lon', 'chai', 'goi'].includes(value), 'Đơn vị tính sản phẩm chỉ hỗ trợ: lon, chai, gói')
const SYSTEM_ROLE_CODES = new Set(['SUPER_ADMIN'])

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

const ensureUserPermissionsTable = async (pool: RouterDependencies['pool']) => {
  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        plant_id UUID REFERENCES plants(id),
        warehouse_id UUID REFERENCES warehouses(id),
        PRIMARY KEY (user_id, permission_id, plant_id, warehouse_id)
      )
    `
  )
}

const ensureInventoryActionStatusesTable = async (pool: RouterDependencies['pool']) => {
  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS inventory_action_statuses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plant_id UUID NOT NULL REFERENCES plants(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        reference_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CANCELLED',
        reason TEXT,
        cancelled_by UUID REFERENCES users(id),
        cancelled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (plant_id, warehouse_id, reference_type, reference_id)
      )
    `
  )
}

const ensureFinishedGoodsUnitPriceColumn = async (pool: RouterDependencies['pool']) => {
  await pool.query(
    `
      ALTER TABLE finished_goods
      ADD COLUMN IF NOT EXISTS unit_price NUMERIC(16, 2) NOT NULL DEFAULT 0
    `
  )
}

const ensureRecipeLossRateColumn = async (pool: RouterDependencies['pool']) => {
  await pool.query(
    `
      ALTER TABLE recipes
      ADD COLUMN IF NOT EXISTS loss_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
    `
  )
}

const ensureRecipeItemScrapRatioColumn = async (pool: RouterDependencies['pool']) => {
  await pool.query(
    `
      ALTER TABLE recipe_items
      ADD COLUMN IF NOT EXISTS scrap_ratio NUMERIC(8, 4) NOT NULL DEFAULT 0
    `
  )
}

const PERMISSION_CATALOG: Array<{ code: string, description: string }> = [
  { code: 'material.view', description: 'Xem nguyên liệu' },
  { code: 'material.create', description: 'Thêm nguyên liệu' },
  { code: 'material.update', description: 'Chỉnh sửa nguyên liệu' },
  { code: 'material.delete', description: 'Xoá nguyên liệu' },
  { code: 'material.cancel', description: 'Huỷ nghiệp vụ nguyên liệu' },
  { code: 'material.manage', description: 'Quản lý nguyên liệu (legacy)' },
  { code: 'supplier.view', description: 'Xem nhà cung cấp' },
  { code: 'supplier.create', description: 'Thêm nhà cung cấp' },
  { code: 'supplier.update', description: 'Chỉnh sửa nhà cung cấp' },
  { code: 'supplier.delete', description: 'Xoá nhà cung cấp' },
  { code: 'supplier.cancel', description: 'Huỷ nghiệp vụ nhà cung cấp' },
  { code: 'supplier.manage', description: 'Quản lý nhà cung cấp (legacy)' },
  { code: 'recipe.view', description: 'Xem công thức' },
  { code: 'recipe.create', description: 'Thêm công thức' },
  { code: 'recipe.update', description: 'Chỉnh sửa công thức' },
  { code: 'recipe.delete', description: 'Xoá công thức' },
  { code: 'recipe.cancel', description: 'Huỷ phiên bản công thức' },
  { code: 'recipe.manage', description: 'Quản lý công thức (legacy)' },
  { code: 'inventory.receive', description: 'Nhập kho NVL' },
  { code: 'inventory.issue', description: 'Xuất kho NVL' },
  { code: 'inventory.adjust', description: 'Điều chỉnh/hủy NVL' },
  { code: 'inventory.cancel', description: 'Huỷ phiếu kho' },
  { code: 'production.view', description: 'Xem sản xuất' },
  { code: 'production.create', description: 'Tạo lệnh sản xuất' },
  { code: 'production.approve', description: 'Xét duyệt lệnh sản xuất' },
  { code: 'production.update', description: 'Chỉnh sửa lệnh sản xuất' },
  { code: 'production.delete', description: 'Xoá lệnh sản xuất' },
  { code: 'production.cancel', description: 'Huỷ nghiệp vụ sản xuất' },
  { code: 'report.view', description: 'Xem báo cáo' },
  { code: 'report.create', description: 'Tạo báo cáo' },
  { code: 'report.update', description: 'Chỉnh sửa cấu hình báo cáo' },
  { code: 'report.delete', description: 'Xoá báo cáo' },
  { code: 'report.cancel', description: 'Huỷ tác vụ báo cáo' },
  { code: 'report.manage', description: 'Quản lý báo cáo (legacy)' },
  { code: 'user.manage', description: 'Quản lý người dùng và phân quyền' }
]

const ensurePermissionCatalog = async (pool: RouterDependencies['pool']) => {
  for (const permission of PERMISSION_CATALOG) {
    await pool.query(
      `
        INSERT INTO permissions (id, code, description)
        VALUES (gen_random_uuid(), $1, $2)
        ON CONFLICT (code) DO UPDATE
        SET description = EXCLUDED.description
      `,
      [permission.code, permission.description]
    )
  }

  await pool.query(
    `
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT rp.role_id, approve_permission.id
      FROM role_permissions rp
      INNER JOIN permissions create_permission ON create_permission.id = rp.permission_id
      CROSS JOIN permissions approve_permission
      WHERE create_permission.code = 'production.create'
        AND approve_permission.code = 'production.approve'
      ON CONFLICT DO NOTHING
    `
  )
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

const getActionStatusLabel = (status: string) => {
  if (status === 'CANCELLED') {
    return 'Đã huỷ'
  }
  return 'Đang hiệu lực'
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

const getMonthRangeFromMonthKey = (monthKey: string) => {
  const [yearRaw, monthRaw] = monthKey.split('-')
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))
  return {
    from: start.toISOString(),
    to: end.toISOString()
  }
}

const getDateRangeFromDayKeys = (fromDateKey: string, toDateKey: string) => {
  const from = new Date(`${fromDateKey}T00:00:00.000Z`)
  const toStart = new Date(`${toDateKey}T00:00:00.000Z`)
  const to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString(),
    to: to.toISOString()
  }
}

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
    await ensureRecipeLossRateColumn(pool)
    await ensureRecipeItemScrapRatioColumn(pool)
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
    await ensureInventoryActionStatusesTable(pool)
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
          COALESCE(ias.status, 'ACTIVE') AS status,
          COALESCE(SUM(pri.quantity), 0) AS total_quantity,
          COALESCE(SUM(pri.quantity * pri.unit_price), 0) AS total_amount,
          COUNT(pri.id)::int AS item_count
        FROM purchase_receipts pr
        LEFT JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
        LEFT JOIN inventory_action_statuses ias
          ON ias.plant_id = pr.plant_id
         AND ias.warehouse_id = pr.warehouse_id
         AND ias.reference_type = 'PURCHASE_RECEIPT'
         AND ias.reference_id = pr.id::text
        WHERE pr.plant_id = $1
          AND pr.supplier_id = $2
        GROUP BY pr.id, pr.receipt_no, pr.received_at, pr.note, pr.warehouse_id, ias.status
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
        status: String(row.status),
        statusLabel: getActionStatusLabel(String(row.status)),
        itemCount: Number(row.item_count),
        totalQuantity: Number(row.total_quantity),
        totalAmount: Number(row.total_amount)
      }))
    }))
  }))

  router.get('/purchase-receipts/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'supplier.manage')
    await ensureInventoryActionStatusesTable(pool)
    const receiptId = String(request.params.id)

    const receiptResult = await pool.query(
      `
        SELECT
          pr.id,
          pr.receipt_no,
          pr.received_at,
          pr.note,
          pr.warehouse_id,
          COALESCE(ias.status, 'ACTIVE') AS status,
          pr.supplier_id,
          s.code AS supplier_code,
          s.name AS supplier_name
        FROM purchase_receipts pr
        INNER JOIN suppliers s ON s.id = pr.supplier_id
        LEFT JOIN inventory_action_statuses ias
          ON ias.plant_id = pr.plant_id
         AND ias.warehouse_id = pr.warehouse_id
         AND ias.reference_type = 'PURCHASE_RECEIPT'
         AND ias.reference_id = pr.id::text
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
      status: String(receiptRow.status),
      statusLabel: getActionStatusLabel(String(receiptRow.status)),
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
    await ensureFinishedGoodsUnitPriceColumn(pool)
    await ensureRecipeLossRateColumn(pool)
    await ensureRecipeItemScrapRatioColumn(pool)
    const schema = z.object({
      id: idSchema,
      name: z.string().min(1),
      lossRatePercent: z.number().min(0).max(99.99).optional(),
      product: z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        uom: finishedGoodUomSchema,
        unitPrice: z.number().nonnegative()
      }),
      items: z.array(z.object({
        materialId: idSchema,
        qtyPerUnit: z.number().positive(),
        applyLoss: z.boolean().optional()
      })).min(1)
    })

    const payload = schema.parse(request.body)

    const recipe = await withTransaction(pool, async (client) => {
      const transactionalServices = createTransactionalServices(dependencies, client)
      const finishedGoodResult = await client.query(
        `
          INSERT INTO finished_goods (id, plant_id, code, name, uom, unit_price, is_active, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, now(), now())
          RETURNING id
        `,
        [auth.plantId, payload.product.code, payload.product.name, payload.product.uom, payload.product.unitPrice]
      )

      return transactionalServices.recipeService.createRecipe(auth, {
        id: payload.id,
        plantId: auth.plantId,
        finishedGoodId: String(finishedGoodResult.rows[0].id),
        name: payload.name,
        lossRatePercent: payload.lossRatePercent ?? 0,
        items: payload.items.map((item) => ({
          materialId: item.materialId,
          qtyPerUnit: item.qtyPerUnit,
          scrapRatio: item.applyLoss ? Number(((payload.lossRatePercent ?? 0) / 100).toFixed(4)) : 0
        }))
      })
    })

    return response.status(201).json(toSuccessResponse(recipe))
  }))

  router.put('/recipes/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    await ensureFinishedGoodsUnitPriceColumn(pool)
    await ensureRecipeLossRateColumn(pool)
    await ensureRecipeItemScrapRatioColumn(pool)
    const schema = z.object({
      name: z.string().min(1),
      lossRatePercent: z.number().min(0).max(99.99).optional(),
      productName: z.string().min(1).optional(),
      productUom: finishedGoodUomSchema.optional(),
      productUnitPrice: z.number().nonnegative().optional(),
      items: z.array(z.object({
        materialId: idSchema,
        qtyPerUnit: z.number().positive(),
        applyLoss: z.boolean().optional()
      })).min(1)
    })

    const input = schema.parse(request.body)
    const normalizedLossRatePercent = input.lossRatePercent ?? 0
    const recipe = await withTransaction(pool, async (client) => {
      const transactionalServices = createTransactionalServices(dependencies, client)
      const updatedRecipe = await transactionalServices.recipeService.updateRecipe(auth, String(request.params.id), {
        ...input,
        items: input.items.map((item) => ({
          materialId: item.materialId,
          qtyPerUnit: item.qtyPerUnit,
          scrapRatio: item.applyLoss ? Number((normalizedLossRatePercent / 100).toFixed(4)) : 0
        }))
      })

      if (input.productName || input.productUom || input.productUnitPrice !== undefined) {
        await client.query(
          `
            UPDATE finished_goods
            SET name = COALESCE($3, name),
                uom = COALESCE($4, uom),
                unit_price = COALESCE($5, unit_price),
                updated_at = now()
            WHERE id = $1
              AND plant_id = $2
          `,
          [
            updatedRecipe.finishedGoodId,
            auth.plantId,
            input.productName ?? null,
            input.productUom ?? null,
            input.productUnitPrice ?? null
          ]
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

  router.get('/inventory/actions', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    requireWarehouseAccess(auth, query.warehouseId)
    await ensureInventoryActionStatusesTable(pool)

    const result = await pool.query(
      `
        WITH receipt_actions AS (
          SELECT
            pr.id::text AS reference_id,
            'PURCHASE_RECEIPT'::text AS reference_type,
            'RECEIPT'::text AS action_type,
            pr.receipt_no AS document_no,
            pr.received_at AS moved_at,
            COALESCE(SUM(pri.quantity), 0) AS total_quantity
          FROM purchase_receipts pr
          LEFT JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
          WHERE pr.plant_id = $1
            AND pr.warehouse_id = $2
          GROUP BY pr.id, pr.receipt_no, pr.received_at
        ),
        issue_actions AS (
          SELECT
            sm.reference_id::text AS reference_id,
            sm.reference_type,
            CASE
              WHEN sm.reference_type = 'DISPOSAL' THEN 'DISPOSAL'
              ELSE 'ISSUE'
            END AS action_type,
            sm.reference_id::text AS document_no,
            MIN(sm.moved_at) AS moved_at,
            COALESCE(SUM(sm.quantity), 0) AS total_quantity
          FROM stock_movements sm
          WHERE sm.plant_id = $1
            AND sm.warehouse_id = $2
            AND sm.direction = -1
            AND sm.reference_type IN ('MANUAL_ISSUE', 'DISPOSAL')
          GROUP BY sm.reference_id, sm.reference_type
        ),
        actions AS (
          SELECT * FROM receipt_actions
          UNION ALL
          SELECT * FROM issue_actions
        )
        SELECT
          actions.reference_id,
          actions.reference_type,
          actions.action_type,
          actions.document_no,
          actions.moved_at,
          actions.total_quantity,
          COALESCE(ias.status, 'ACTIVE') AS status
        FROM actions
        LEFT JOIN inventory_action_statuses ias
          ON ias.plant_id = $1
         AND ias.warehouse_id = $2
         AND ias.reference_type = actions.reference_type
         AND ias.reference_id = actions.reference_id
        ORDER BY actions.moved_at DESC
      `,
      [auth.plantId, query.warehouseId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      referenceId: String(row.reference_id),
      referenceType: String(row.reference_type),
      actionType: String(row.action_type),
      documentNo: String(row.document_no),
      movedAt: new Date(String(row.moved_at)).toISOString(),
      totalQuantity: Number(row.total_quantity),
      status: String(row.status),
      statusLabel: getActionStatusLabel(String(row.status))
    }))))
  }))

  router.post('/inventory/actions/cancel', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema,
      referenceType: z.enum(['PURCHASE_RECEIPT', 'DISPOSAL']),
      referenceId: z.string().min(1),
      reason: z.string().optional()
    })
    const payload = schema.parse(request.body)
    requireWarehouseAccess(auth, payload.warehouseId)
    await ensureInventoryActionStatusesTable(pool)
    requirePermission(auth, 'inventory.cancel')

    await withTransaction(pool, async (client) => {
      const currentStatusResult = await client.query(
        `
          SELECT status
          FROM inventory_action_statuses
          WHERE plant_id = $1
            AND warehouse_id = $2
            AND reference_type = $3
            AND reference_id = $4
          LIMIT 1
        `,
        [auth.plantId, payload.warehouseId, payload.referenceType, payload.referenceId]
      )

      if (currentStatusResult.rowCount && String(currentStatusResult.rows[0].status) === 'CANCELLED') {
        return
      }

      const movementResult = await client.query(
        `
          SELECT id, material_batch_id, material_id, quantity, unit_cost, moved_at
          FROM stock_movements
          WHERE plant_id = $1
            AND warehouse_id = $2
            AND reference_type = $3
            AND reference_id = $4
            AND direction = $5
          ORDER BY moved_at ASC
        `,
        [
          auth.plantId,
          payload.warehouseId,
          payload.referenceType,
          payload.referenceId,
          payload.referenceType === 'PURCHASE_RECEIPT' ? 1 : -1
        ]
      )

      if (!movementResult.rowCount || movementResult.rowCount === 0) {
        throw new NotFoundError('Inventory action')
      }

      for (const movement of movementResult.rows) {
        const batchId = movement.material_batch_id ? String(movement.material_batch_id) : null
        if (!batchId) {
          continue
        }
        const quantity = Number(movement.quantity)

        const batchResult = await client.query(
          `
            SELECT qty_available
            FROM material_batches
            WHERE id = $1
            FOR UPDATE
          `,
          [batchId]
        )
        if (!batchResult.rowCount || batchResult.rowCount === 0) {
          throw new NotFoundError('Material batch')
        }
        const qtyAvailable = Number(batchResult.rows[0].qty_available)

        if (payload.referenceType === 'PURCHASE_RECEIPT') {
          if (qtyAvailable < quantity) {
            throw new ConflictError('Không thể huỷ phiếu nhập vì lô đã được sử dụng một phần')
          }
          await client.query(
            `
              UPDATE material_batches
              SET qty_available = qty_available - $2
              WHERE id = $1
            `,
            [batchId, quantity]
          )
          await client.query(
            `
              INSERT INTO stock_movements (
                id, plant_id, warehouse_id, material_id, material_batch_id, movement_type, direction, quantity, unit_cost,
                reference_type, reference_id, moved_at, created_at
              )
              VALUES (
                gen_random_uuid(), $1, $2, $3, $4, 'ADJUSTMENT_MINUS', -1, $5, $6, 'RECEIPT_CANCEL', $7, now(), now()
              )
            `,
            [auth.plantId, payload.warehouseId, String(movement.material_id), batchId, quantity, Number(movement.unit_cost), payload.referenceId]
          )
          continue
        }

        await client.query(
          `
            UPDATE material_batches
            SET qty_available = qty_available + $2
            WHERE id = $1
          `,
          [batchId, quantity]
        )
        await client.query(
          `
            INSERT INTO stock_movements (
              id, plant_id, warehouse_id, material_id, material_batch_id, movement_type, direction, quantity, unit_cost,
              reference_type, reference_id, moved_at, created_at
            )
            VALUES (
              gen_random_uuid(), $1, $2, $3, $4, 'ADJUSTMENT_PLUS', 1, $5, $6, $7, $8, now(), now()
            )
          `,
          [
            auth.plantId,
            payload.warehouseId,
            String(movement.material_id),
            batchId,
            quantity,
            Number(movement.unit_cost),
            `${payload.referenceType}_CANCEL`,
            payload.referenceId
          ]
        )
      }

      await client.query(
        `
          INSERT INTO inventory_action_statuses (
            plant_id, warehouse_id, reference_type, reference_id, status, reason, cancelled_by, cancelled_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'CANCELLED', $5, $6, now(), now(), now())
          ON CONFLICT (plant_id, warehouse_id, reference_type, reference_id)
          DO UPDATE
          SET status = 'CANCELLED',
              reason = EXCLUDED.reason,
              cancelled_by = EXCLUDED.cancelled_by,
              cancelled_at = now(),
              updated_at = now()
        `,
        [auth.plantId, payload.warehouseId, payload.referenceType, payload.referenceId, payload.reason ?? null, auth.userId]
      )
    })

    return response.json(toSuccessResponse({
      referenceId: payload.referenceId,
      referenceType: payload.referenceType,
      status: 'CANCELLED',
      statusLabel: getActionStatusLabel('CANCELLED')
    }))
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

  router.get('/inventory/finished-goods/issues', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    requireWarehouseAccess(auth, query.warehouseId)
    await ensureInventoryActionStatusesTable(pool)

    const result = await pool.query(
      `
        SELECT
          sm.id,
          sm.finished_good_id,
          fg.code,
          fg.name,
          fg.uom,
          sm.quantity,
          sm.unit_cost,
          sm.moved_at,
          sm.reference_type,
          sm.reference_id::text AS reference_id,
          COALESCE(ias.status, 'ACTIVE') AS status
        FROM stock_movements sm
        INNER JOIN finished_goods fg ON fg.id = sm.finished_good_id
        LEFT JOIN inventory_action_statuses ias
          ON ias.plant_id = sm.plant_id
         AND ias.warehouse_id = sm.warehouse_id
         AND ias.reference_type = sm.reference_type
         AND ias.reference_id = sm.reference_id::text
        WHERE sm.plant_id = $1
          AND sm.warehouse_id = $2
          AND sm.finished_good_id IS NOT NULL
          AND sm.direction = -1
          AND sm.reference_type LIKE 'FG_MANUAL_ISSUE%'
        ORDER BY sm.moved_at DESC
      `,
      [auth.plantId, query.warehouseId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      finishedGoodId: String(row.finished_good_id),
      code: String(row.code),
      name: String(row.name),
      uom: String(row.uom),
      quantity: Number(row.quantity),
      unitCost: Number(row.unit_cost),
      movedAt: new Date(String(row.moved_at)).toISOString(),
      referenceType: String(row.reference_type),
      referenceTypeLabel: getReferenceTypeLabel(String(row.reference_type)),
      referenceId: String(row.reference_id),
      status: String(row.status),
      statusLabel: getActionStatusLabel(String(row.status))
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

  router.post('/inventory/finished-goods/issues/cancel', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'inventory.cancel')
    const schema = z.object({
      warehouseId: idSchema,
      referenceType: z.string().min(1),
      referenceId: z.string().min(1),
      reason: z.string().optional()
    })
    const payload = schema.parse(request.body)
    requireWarehouseAccess(auth, payload.warehouseId)
    await ensureInventoryActionStatusesTable(pool)

    await withTransaction(pool, async (client) => {
      const currentStatusResult = await client.query(
        `
          SELECT status
          FROM inventory_action_statuses
          WHERE plant_id = $1
            AND warehouse_id = $2
            AND reference_type = $3
            AND reference_id = $4
          LIMIT 1
        `,
        [auth.plantId, payload.warehouseId, payload.referenceType, payload.referenceId]
      )

      if (currentStatusResult.rowCount && String(currentStatusResult.rows[0].status) === 'CANCELLED') {
        return
      }

      const issueRows = await client.query(
        `
          SELECT id, finished_good_id, quantity, unit_cost
          FROM stock_movements
          WHERE plant_id = $1
            AND warehouse_id = $2
            AND reference_type = $3
            AND reference_id = $4
            AND finished_good_id IS NOT NULL
            AND direction = -1
          FOR UPDATE
        `,
        [auth.plantId, payload.warehouseId, payload.referenceType, payload.referenceId]
      )

      if (!issueRows.rowCount || issueRows.rowCount === 0) {
        throw new NotFoundError('Finished good issue')
      }

      for (const row of issueRows.rows) {
        await client.query(
          `
            INSERT INTO stock_movements (
              id, plant_id, warehouse_id, finished_good_id,
              movement_type, direction, quantity, unit_cost,
              reference_type, reference_id, moved_at, created_at
            )
            VALUES (
              gen_random_uuid(), $1, $2, $3,
              'RECEIPT', 1, $4, $5,
              'FG_ISSUE_CANCEL', $6, now(), now()
            )
          `,
          [
            auth.plantId,
            payload.warehouseId,
            String(row.finished_good_id),
            Number(row.quantity),
            Number(row.unit_cost),
            payload.referenceId
          ]
        )
      }

      await client.query(
        `
          INSERT INTO inventory_action_statuses (
            plant_id, warehouse_id, reference_type, reference_id, status, reason, cancelled_by, cancelled_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'CANCELLED', $5, $6, now(), now(), now())
          ON CONFLICT (plant_id, warehouse_id, reference_type, reference_id)
          DO UPDATE
          SET status = 'CANCELLED',
              reason = EXCLUDED.reason,
              cancelled_by = EXCLUDED.cancelled_by,
              cancelled_at = now(),
              updated_at = now()
        `,
        [auth.plantId, payload.warehouseId, payload.referenceType, payload.referenceId, payload.reason ?? null, auth.userId]
      )
    })

    return response.json(toSuccessResponse({
      referenceType: payload.referenceType,
      referenceId: payload.referenceId,
      status: 'CANCELLED',
      statusLabel: getActionStatusLabel('CANCELLED')
    }))
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
    await ensureFinishedGoodsUnitPriceColumn(pool)
    const result = await pool.query(
      `
        SELECT id, code, name, uom, unit_price, is_active
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
      unitPrice: Number(row.unit_price),
      isActive: Boolean(row.is_active)
    }))))
  }))

  router.get('/master/recipes', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'recipe.view')
    await ensureFinishedGoodsUnitPriceColumn(pool)
    await ensureRecipeLossRateColumn(pool)
    await ensureRecipeItemScrapRatioColumn(pool)
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.finished_good_id,
          r.version_no,
          r.loss_rate_percent,
          COALESCE(fg.name, fg.code) AS name,
          fg.code AS product_code,
          fg.name AS product_name,
          fg.uom AS product_uom,
          fg.unit_price AS product_unit_price,
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
      lossRatePercent: Number(row.loss_rate_percent ?? 0),
      name: String(row.name),
      productCode: row.product_code ? String(row.product_code) : '',
      productName: row.product_name ? String(row.product_name) : '',
      productUom: row.product_uom ? String(row.product_uom) : '',
      productUnitPrice: Number(row.product_unit_price ?? 0),
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
    await ensureRecipeLossRateColumn(pool)
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
    await ensureRecipeLossRateColumn(pool)
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

  router.get('/reports/inventory-detail', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/),
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    const range = getMonthRangeFromMonthKey(query.monthKey)

    const materialSummaryResult = await pool.query(
      `
        SELECT
          m.id AS material_id,
          m.code,
          m.name,
          m.uom,
          COALESCE(SUM(CASE WHEN sm.moved_at >= $3::timestamptz AND sm.moved_at < $4::timestamptz AND sm.direction = 1 THEN sm.quantity ELSE 0 END), 0) AS period_receipt_qty,
          COALESCE(SUM(CASE WHEN sm.moved_at >= $3::timestamptz AND sm.moved_at < $4::timestamptz AND sm.direction = -1 AND sm.movement_type <> 'DISPOSAL' THEN sm.quantity ELSE 0 END), 0) AS period_issue_qty,
          COALESCE(SUM(CASE WHEN sm.moved_at >= $3::timestamptz AND sm.moved_at < $4::timestamptz AND sm.movement_type = 'DISPOSAL' THEN sm.quantity ELSE 0 END), 0) AS period_disposal_qty,
          COALESCE(SUM(CASE WHEN sm.direction = 1 THEN sm.quantity WHEN sm.direction = -1 THEN -sm.quantity ELSE 0 END), 0) AS on_hand_qty
        FROM materials m
        LEFT JOIN stock_movements sm
          ON sm.material_id = m.id
          AND sm.warehouse_id = $2
          AND sm.plant_id = $1
        WHERE m.plant_id = $1
        GROUP BY m.id, m.code, m.name, m.uom
        ORDER BY m.code ASC
      `,
      [auth.plantId, query.warehouseId, range.from, range.to]
    )

    const finishedGoodSummaryResult = await pool.query(
      `
        SELECT
          fg.id AS finished_good_id,
          fg.code,
          fg.name,
          fg.uom,
          COALESCE(SUM(CASE WHEN sm.moved_at >= $3::timestamptz AND sm.moved_at < $4::timestamptz AND sm.direction = 1 THEN sm.quantity ELSE 0 END), 0) AS period_receipt_qty,
          COALESCE(SUM(CASE WHEN sm.moved_at >= $3::timestamptz AND sm.moved_at < $4::timestamptz AND sm.direction = -1 THEN sm.quantity ELSE 0 END), 0) AS period_issue_qty,
          COALESCE(SUM(CASE WHEN sm.direction = 1 THEN sm.quantity WHEN sm.direction = -1 THEN -sm.quantity ELSE 0 END), 0) AS on_hand_qty
        FROM finished_goods fg
        LEFT JOIN stock_movements sm
          ON sm.finished_good_id = fg.id
          AND sm.warehouse_id = $2
          AND sm.plant_id = $1
        WHERE fg.plant_id = $1
        GROUP BY fg.id, fg.code, fg.name, fg.uom
        ORDER BY fg.code ASC
      `,
      [auth.plantId, query.warehouseId, range.from, range.to]
    )

    return response.json(toSuccessResponse({
      monthKey: query.monthKey,
      warehouseId: query.warehouseId,
      materials: materialSummaryResult.rows.map((row) => ({
        materialId: String(row.material_id),
        code: String(row.code),
        name: String(row.name),
        uom: String(row.uom),
        periodReceiptQty: Number(row.period_receipt_qty),
        periodIssueQty: Number(row.period_issue_qty),
        periodDisposalQty: Number(row.period_disposal_qty),
        onHandQty: Number(row.on_hand_qty)
      })),
      finishedGoods: finishedGoodSummaryResult.rows.map((row) => ({
        finishedGoodId: String(row.finished_good_id),
        code: String(row.code),
        name: String(row.name),
        uom: String(row.uom),
        periodReceiptQty: Number(row.period_receipt_qty),
        periodIssueQty: Number(row.period_issue_qty),
        onHandQty: Number(row.on_hand_qty)
      }))
    }))
  }))

  router.get('/reports/material-price-trend', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema,
      periodType: z.enum(['week', 'month']),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    })
    const query = schema.parse(request.query)
    const range = getDateRangeFromDayKeys(query.fromDate, query.toDate)

    const result = await pool.query(
      `
        SELECT
          m.id AS material_id,
          m.code,
          m.name,
          CASE
            WHEN $5::text = 'week'
              THEN to_char(date_trunc('week', pr.received_at), 'IYYY-"W"IW')
            ELSE to_char(date_trunc('month', pr.received_at), 'YYYY-MM')
          END AS period_key,
          date_trunc(CASE WHEN $5::text = 'week' THEN 'week' ELSE 'month' END, pr.received_at) AS period_start,
          ROUND(AVG(pri.unit_price)::numeric, 2) AS avg_unit_price,
          ROUND(MIN(pri.unit_price)::numeric, 2) AS min_unit_price,
          ROUND(MAX(pri.unit_price)::numeric, 2) AS max_unit_price,
          COUNT(pri.id)::int AS sample_count
        FROM purchase_receipts pr
        INNER JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
        INNER JOIN materials m ON m.id = pri.material_id
        WHERE pr.plant_id = $1
          AND pr.warehouse_id = $2
          AND pr.received_at >= $3::timestamptz
          AND pr.received_at < $4::timestamptz
        GROUP BY m.id, m.code, m.name, period_key, period_start
        ORDER BY m.code ASC, period_start ASC
      `,
      [auth.plantId, query.warehouseId, range.from, range.to, query.periodType]
    )

    const periodsMap = new Map<string, { periodKey: string, periodStart: string }>()
    const materialsMap = new Map<string, {
      materialId: string
      code: string
      name: string
      points: Array<{
        periodKey: string
        periodStart: string
        avgUnitPrice: number
        minUnitPrice: number
        maxUnitPrice: number
        sampleCount: number
      }>
    }>()

    for (const row of result.rows) {
      const periodKey = String(row.period_key)
      const periodStart = new Date(String(row.period_start)).toISOString()
      periodsMap.set(periodKey, { periodKey, periodStart })

      const materialId = String(row.material_id)
      if (!materialsMap.has(materialId)) {
        materialsMap.set(materialId, {
          materialId,
          code: String(row.code),
          name: String(row.name),
          points: []
        })
      }

      materialsMap.get(materialId)?.points.push({
        periodKey,
        periodStart,
        avgUnitPrice: Number(row.avg_unit_price),
        minUnitPrice: Number(row.min_unit_price),
        maxUnitPrice: Number(row.max_unit_price),
        sampleCount: Number(row.sample_count)
      })
    }

    const periods = Array.from(periodsMap.values()).sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    const materials = Array.from(materialsMap.values())

    return response.json(toSuccessResponse({
      warehouseId: query.warehouseId,
      periodType: query.periodType,
      fromDate: query.fromDate,
      toDate: query.toDate,
      periods,
      materials
    }))
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
    await ensurePermissionCatalog(pool)
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

  router.post('/admin/roles', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    await ensurePermissionCatalog(pool)
    const schema = z.object({
      code: z.string().min(2),
      name: z.string().min(2),
      permissionCodes: z.array(z.string().min(1)).min(1)
    })
    const payload = schema.parse(request.body)
    const normalizedCode = payload.code.trim().toUpperCase()
    const normalizedName = payload.name.trim()
    const uniquePermissionCodes = Array.from(new Set(payload.permissionCodes.map((value) => value.trim()).filter(Boolean)))

    const createdRole = await withTransaction(pool, async (client) => {
      const existingRole = await client.query(
        `
          SELECT id
          FROM roles
          WHERE code = $1
          LIMIT 1
        `,
        [normalizedCode]
      )

      if (existingRole.rowCount && existingRole.rowCount > 0) {
        throw new ConflictError('Mã vai trò đã tồn tại')
      }

      const permissionResult = await client.query(
        `
          SELECT id, code
          FROM permissions
          WHERE code = ANY($1::text[])
        `,
        [uniquePermissionCodes]
      )

      const resolvedCodes = new Set(permissionResult.rows.map((row) => String(row.code)))
      const missingCodes = uniquePermissionCodes.filter((code) => !resolvedCodes.has(code))
      if (missingCodes.length > 0) {
        throw new ValidationError(`Không tìm thấy quyền: ${missingCodes.join(', ')}`)
      }

      const roleResult = await client.query(
        `
          INSERT INTO roles (id, code, name, created_at)
          VALUES (gen_random_uuid(), $1, $2, now())
          RETURNING id, code, name
        `,
        [normalizedCode, normalizedName]
      )

      const roleId = String(roleResult.rows[0].id)
      for (const row of permissionResult.rows) {
        await client.query(
          `
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES ($1, $2)
          `,
          [roleId, String(row.id)]
        )
      }

      return {
        id: roleId,
        code: String(roleResult.rows[0].code),
        name: String(roleResult.rows[0].name),
        permissions: uniquePermissionCodes
      }
    })

    return response.status(201).json(toSuccessResponse(createdRole))
  }))

  router.put('/admin/roles/:id/permissions', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    await ensurePermissionCatalog(pool)
    const schema = z.object({
      permissionCodes: z.array(z.string().min(1)).min(1)
    })
    const payload = schema.parse(request.body)
    const uniquePermissionCodes = Array.from(new Set(payload.permissionCodes.map((value) => value.trim()).filter(Boolean)))

    const updatedRole = await withTransaction(pool, async (client) => {
      const roleResult = await client.query(
        `
          SELECT id, code, name
          FROM roles
          WHERE id = $1
          LIMIT 1
        `,
        [String(request.params.id)]
      )

      if (!roleResult.rowCount || roleResult.rowCount === 0) {
        throw new NotFoundError('Role')
      }
      const roleCode = String(roleResult.rows[0].code).toUpperCase()
      if (SYSTEM_ROLE_CODES.has(roleCode)) {
        throw new ForbiddenError(`Không được chỉnh sửa quyền vai trò hệ thống: ${roleCode}`)
      }

      const permissionResult = await client.query(
        `
          SELECT id, code
          FROM permissions
          WHERE code = ANY($1::text[])
        `,
        [uniquePermissionCodes]
      )

      const resolvedCodes = new Set(permissionResult.rows.map((row) => String(row.code)))
      const missingCodes = uniquePermissionCodes.filter((code) => !resolvedCodes.has(code))
      if (missingCodes.length > 0) {
        throw new ValidationError(`Không tìm thấy quyền: ${missingCodes.join(', ')}`)
      }

      await client.query(
        `
          DELETE FROM role_permissions
          WHERE role_id = $1
        `,
        [String(request.params.id)]
      )

      for (const row of permissionResult.rows) {
        await client.query(
          `
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES ($1, $2)
          `,
          [String(request.params.id), String(row.id)]
        )
      }

      return {
        id: String(roleResult.rows[0].id),
        code: String(roleResult.rows[0].code),
        name: String(roleResult.rows[0].name),
        permissions: uniquePermissionCodes
      }
    })

    return response.json(toSuccessResponse(updatedRole))
  }))

  router.get('/admin/permissions', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    await ensurePermissionCatalog(pool)
    const result = await pool.query(
      `
        SELECT id, code, description
        FROM permissions
        ORDER BY code ASC
      `
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      description: String(row.description)
    }))))
  }))

  router.get('/admin/users', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    await ensureUserPermissionsTable(pool)
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
          ) AS assignments,
          COALESCE(
            array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL),
            '{}'
          ) AS direct_permissions
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        LEFT JOIN user_permissions up ON up.user_id = u.id AND (up.plant_id IS NULL OR up.plant_id = $1)
        LEFT JOIN permissions p ON p.id = up.permission_id
        GROUP BY u.id, u.email, u.full_name, u.is_active
        ORDER BY u.created_at DESC
      `,
      [auth.plantId]
    )

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      fullName: String(row.full_name),
      isActive: Boolean(row.is_active),
      assignments: Array.isArray(row.assignments) ? row.assignments : [],
      directPermissions: Array.isArray(row.direct_permissions)
        ? row.direct_permissions.map((value: unknown) => String(value))
        : []
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

  router.put('/admin/users/:id', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    const schema = z.object({
      email: z.string().email().optional(),
      fullName: z.string().min(1).optional(),
      isActive: z.boolean().optional()
    }).refine(
      (value) => value.email !== undefined || value.fullName !== undefined || value.isActive !== undefined,
      { message: 'Vui lòng cung cấp ít nhất một trường để cập nhật' }
    )
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        UPDATE users
        SET email = COALESCE($2, email),
            full_name = COALESCE($3, full_name),
            is_active = COALESCE($4, is_active),
            updated_at = now()
        WHERE id = $1
        RETURNING id, email, full_name, is_active
      `,
      [
        String(request.params.id),
        payload.email ?? null,
        payload.fullName ?? null,
        payload.isActive ?? null
      ]
    )

    if (result.rowCount === 0) {
      throw new NotFoundError('User')
    }

    const updated = result.rows[0]
    return response.json(toSuccessResponse({
      id: String(updated.id),
      email: String(updated.email),
      fullName: String(updated.full_name),
      isActive: Boolean(updated.is_active)
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

  router.put('/admin/users/:id/permissions', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'user.manage')
    await ensureUserPermissionsTable(pool)
    const schema = z.object({
      permissions: z.array(z.string().min(1))
    })
    const payload = schema.parse(request.body)
    const permissionCodes = Array.from(new Set(payload.permissions.map((value) => value.trim()).filter(Boolean)))

    await withTransaction(pool, async (client) => {
      await client.query(
        `
          DELETE FROM user_permissions
          WHERE user_id = $1
            AND (plant_id IS NULL OR plant_id = $2)
        `,
        [String(request.params.id), auth.plantId]
      )

      if (permissionCodes.length === 0) {
        return
      }

      const permissionResult = await client.query(
        `
          SELECT id
          FROM permissions
          WHERE code = ANY($1::text[])
        `,
        [permissionCodes]
      )

      for (const row of permissionResult.rows) {
        await client.query(
          `
            INSERT INTO user_permissions (user_id, permission_id, plant_id, warehouse_id)
            VALUES ($1, $2, $3, $4)
          `,
          [String(request.params.id), String(row.id), auth.plantId, auth.warehouseIds[0] ?? null]
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
