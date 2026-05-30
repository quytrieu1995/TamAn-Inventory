import { Router } from 'express'
import { z } from 'zod'
import { getAuthContextFromRequest } from '../core/http'
import { createPostgresRepositories } from '../db/postgres-repositories'
import { withTransaction } from '../db/transaction'
import { createApplicationServices } from '../index'
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

  router.get('/auth/me', asyncHandler(async (request, response) => {
    const auth = getAuthContextFromRequest(request)
    return response.json(toSuccessResponse(auth))
  }))

  router.get('/recipes/:id', asyncHandler(async (request, response) => {
    const auth = getAuthContextFromRequest(request)
    const recipe = await services.recipeService.getRecipeById(auth, String(request.params.id))
    return response.json(toSuccessResponse(recipe))
  }))

  router.post('/recipes', asyncHandler(async (request, response) => {
    const auth = getAuthContextFromRequest(request)
    const schema = z.object({
      id: idSchema,
      finishedGoodId: idSchema,
      name: z.string().min(1),
      items: z.array(z.object({
        materialId: idSchema,
        qtyPerUnit: z.number().positive()
      })).min(1)
    })

    const payload = schema.parse(request.body)
    const input = {
      ...payload,
      plantId: auth.plantId
    }

    const recipe = await runInTransaction(dependencies, async (transactionalServices) => {
      return transactionalServices.recipeService.createRecipe(auth, input)
    })

    return response.status(201).json(toSuccessResponse(recipe))
  }))

  router.put('/recipes/:id', asyncHandler(async (request, response) => {
    const auth = getAuthContextFromRequest(request)
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
    const auth = getAuthContextFromRequest(request)
    const schema = z.object({
      receiptId: idSchema,
      warehouseId: idSchema,
      receivedAt: z.string().datetime(),
      items: z.array(z.object({
        materialId: idSchema,
        batchNo: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative()
      })).min(1)
    })

    const payload = schema.parse(request.body)

    const result = await executeIdempotent(pool, request, '/inventory/receipts', async (client) => {
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
    const auth = getAuthContextFromRequest(request)
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

  router.post('/inventory/adjustments', asyncHandler(async (request, response) => {
    const auth = getAuthContextFromRequest(request)
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
    const auth = getAuthContextFromRequest(request)
    const schema = z.object({
      warehouseId: idSchema
    })
    const query = schema.parse(request.query)
    const ledger = await services.inventoryService.getWarehouseLedger(auth, query.warehouseId)
    return response.json(toSuccessResponse(ledger))
  }))

  router.post('/production-orders', asyncHandler(async (request, response) => {
    const auth = getAuthContextFromRequest(request)
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
    const auth = getAuthContextFromRequest(request)
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
    const auth = getAuthContextFromRequest(request)
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
    const auth = getAuthContextFromRequest(request)
    const schema = z.object({
      warehouseId: idSchema
    })

    const report = await services.reportService.getDashboard(auth, schema.parse(request.query).warehouseId)
    return response.json(toSuccessResponse(report))
  }))

  router.post('/reports/monthly-snapshot/rebuild', asyncHandler(async (request, response) => {
    const auth = getAuthContextFromRequest(request)
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
    const auth = getAuthContextFromRequest(request)
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

  return router
}
