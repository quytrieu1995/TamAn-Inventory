import { Router } from 'express'
import { z } from 'zod'
import { resolveAuthContextFromRequest } from '../core/http'
import { createPostgresRepositories } from '../db/postgres-repositories'
import { withTransaction } from '../db/transaction'
import { createApplicationServices } from '../index'
import { requirePermission } from '../modules/auth'
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

export const createRouter = (dependencies: RouterDependencies) => {
  const router = Router()
  const { services, pool } = dependencies
  const getAuthContext = (request: Parameters<typeof resolveAuthContextFromRequest>[0]) => {
    return resolveAuthContextFromRequest(request, pool)
  }

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
        RETURNING id, code, name, uom, minimum_stock, max_storage_days
      `,
      [auth.plantId, payload.code, payload.name, payload.uom, payload.minimumStock, payload.maxStorageDays]
    )

    return response.status(201).json(toSuccessResponse(result.rows[0]))
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
        RETURNING id, code, name, uom, minimum_stock, max_storage_days
      `,
      [String(request.params.id), auth.plantId, payload.code, payload.name, payload.uom, payload.minimumStock, payload.maxStorageDays]
    )

    return response.json(toSuccessResponse(result.rows[0] ?? null))
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
      items: z.array(z.object({
        materialId: idSchema,
        qtyPerUnit: z.number().positive()
      })).min(1)
    })

    const input = schema.parse(request.body)
    const recipe = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.recipeService.updateRecipe(auth, String(request.params.id), input)
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
        body: toSuccessResponse(data)
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
        body: toSuccessResponse(data)
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
        body: toSuccessResponse(data)
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

    return response.json(toSuccessResponse(movement))
  }))

  router.get('/inventory/ledger', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    const ledger = await services.inventoryService.getWarehouseLedger(auth, query.warehouseId)
    return response.json(toSuccessResponse(ledger))
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

  router.get('/master/materials', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const result = await pool.query(
      `
        SELECT id, code, name, uom, minimum_stock, max_storage_days
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
      maxStorageDays: Number(row.max_storage_days)
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
        SELECT id, code, name, uom
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
      uom: String(row.uom)
    }))))
  }))

  router.get('/master/recipes', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    requirePermission(auth, 'recipe.view')
    const result = await pool.query(
      `
        SELECT r.id, r.finished_good_id, r.version_no, COALESCE(fg.name, fg.code) AS name
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
      name: String(row.name)
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

    return response.json(toSuccessResponse(result.rows.map((row) => ({
      id: String(row.id),
      orderNo: String(row.order_no),
      finishedGoodId: String(row.finished_good_id),
      recipeId: String(row.recipe_id),
      plannedQty: Number(row.planned_qty),
      actualQty: Number(row.actual_qty),
      status: String(row.status),
      warehouseId: String(row.warehouse_id),
      createdAt: new Date(String(row.created_at)).toISOString()
    }))))
  }))

  router.post('/production-orders', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      warehouseId: idSchema,
      orderNo: z.string().min(1),
      finishedGoodId: idSchema,
      recipeId: idSchema,
      plannedQty: z.number().positive()
    })

    const payload = schema.parse(request.body)
    const order = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.finishedGoodsService.createProductionOrder(auth, payload)
    })

    return response.status(201).json(toSuccessResponse(order))
  }))

  router.post('/production-orders/:id/consume', asyncHandler(async (request, response) => {
    const auth = await getAuthContext(request)
    const schema = z.object({
      movedAt: z.string().datetime()
    })

    const payload = schema.parse(request.body)
    const result = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.finishedGoodsService.consumeMaterialsForOrder(auth, {
        orderId: String(request.params.id),
        movedAt: payload.movedAt
      })
    })

    return response.json(toSuccessResponse(result))
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
        body: toSuccessResponse(data)
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

    return response.json(toSuccessResponse(result))
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
      fullName: z.string().min(1)
    })
    const payload = schema.parse(request.body)

    const result = await pool.query(
      `
        INSERT INTO users (id, email, full_name, password_hash, is_active)
        VALUES (gen_random_uuid(), $1, $2, $3, true)
        RETURNING id, email, full_name, is_active
      `,
      [payload.email, payload.fullName, 'temporary-password-hash']
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

  return router
}
