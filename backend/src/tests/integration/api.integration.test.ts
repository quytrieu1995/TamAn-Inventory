import test from 'node:test'
import assert from 'node:assert/strict'
import type { Express } from 'express'
import type { Pool } from 'pg'
import pino from 'pino'
import request from 'supertest'
import { createApp } from '../../http/app'
import { createTestPool } from '../helpers/test-db'

const IDS = {
  plantId: '11111111-1111-4111-8111-111111111111',
  warehouseId: '22222222-2222-4222-8222-222222222222',
  materialSugar: '33333333-3333-4333-8333-333333333333',
  materialFlour: '44444444-4444-4444-8444-444444444444',
  finishedGood: '55555555-5555-4555-8555-555555555555',
  recipeId: '66666666-6666-4666-8666-666666666666'
}

const headers = {
  'x-user-id': '77777777-7777-4777-8777-777777777777',
  'x-plant-id': IDS.plantId,
  'x-warehouse-ids': IDS.warehouseId,
  'x-permissions': 'recipe.view,recipe.manage,inventory.receive,inventory.issue,inventory.adjust,production.create,report.view,report.manage'
}

const setupApp = async () => {
  const pool = await createTestPool()
  const silentLogger = pino({ enabled: false })
  const { app } = createApp({ pool, appLogger: silentLogger })
  await seedBaseData(pool)
  return { app, pool }
}

const seedBaseData = async (pool: Pool) => {
  await pool.query(
    `
      INSERT INTO plants (id, code, name)
      VALUES ($1, 'P1', 'Plant 1');

      INSERT INTO warehouses (id, plant_id, code, name)
      VALUES ($2, $1, 'W1', 'Warehouse 1');

      INSERT INTO materials (id, plant_id, code, name, uom, minimum_stock, max_storage_days)
      VALUES
        ($3, $1, 'SUGAR001', 'Sugar', 'kg', 20, 30),
        ($4, $1, 'FLOUR001', 'Flour', 'kg', 20, 30);

      INSERT INTO finished_goods (id, plant_id, code, name, uom)
      VALUES ($5, $1, 'FG001', 'Butter Cookie', 'kg');

      INSERT INTO recipes (id, plant_id, finished_good_id, version_no, status)
      VALUES ($6, $1, $5, 1, 'ACTIVE');

      INSERT INTO recipe_items (id, recipe_id, material_id, qty_per_unit)
      VALUES
        (gen_random_uuid(), $6, $3, 0.4),
        (gen_random_uuid(), $6, $4, 0.2);
    `,
    [
      IDS.plantId,
      IDS.warehouseId,
      IDS.materialSugar,
      IDS.materialFlour,
      IDS.finishedGood,
      IDS.recipeId
    ]
  )
}

test('POST /inventory/receipts should be idempotent by key', async () => {
  const { app, pool } = await setupApp()
  const payload = {
    receiptId: '88888888-8888-4888-8888-888888888888',
    warehouseId: IDS.warehouseId,
    receivedAt: '2026-05-01T00:00:00.000Z',
    items: [
      {
        materialId: IDS.materialSugar,
        batchNo: 'SUGAR-B1',
        quantity: 100,
        unitPrice: 10
      }
    ]
  }

  const first = await request(app as Express)
    .post('/api/v1/inventory/receipts')
    .set(headers)
    .set('Idempotency-Key', 'idem-receipt-1')
    .send(payload)

  const second = await request(app as Express)
    .post('/api/v1/inventory/receipts')
    .set(headers)
    .set('Idempotency-Key', 'idem-receipt-1')
    .send(payload)

  assert.equal(first.status, 201)
  assert.equal(second.status, 201)

  const movementCount = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM stock_movements
      WHERE reference_id = $1
        AND movement_type = 'RECEIPT'
    `,
    [payload.receiptId]
  )

  assert.equal(movementCount.rows[0]?.count, 1)
  await pool.end()
})

test('POST /inventory/issues should rollback when stock is insufficient', async () => {
  const { app, pool } = await setupApp()

  const receiptResponse = await request(app as Express)
    .post('/api/v1/inventory/receipts')
    .set(headers)
    .set('Idempotency-Key', 'idem-receipt-2')
    .send({
      receiptId: '99999999-9999-4999-8999-999999999999',
      warehouseId: IDS.warehouseId,
      receivedAt: '2026-05-01T00:00:00.000Z',
      items: [
        {
          materialId: IDS.materialSugar,
          batchNo: 'SUGAR-B2',
          quantity: 10,
          unitPrice: 10
        }
      ]
    })
  assert.equal(receiptResponse.status, 201)

  const issueResponse = await request(app as Express)
    .post('/api/v1/inventory/issues')
    .set(headers)
    .set('Idempotency-Key', 'idem-issue-1')
    .send({
      warehouseId: IDS.warehouseId,
      referenceType: 'MANUAL_ISSUE',
      referenceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      movedAt: '2026-05-02T00:00:00.000Z',
      items: [
        {
          materialId: IDS.materialSugar,
          quantity: 20
        }
      ]
    })

  assert.equal(issueResponse.status, 409)

  const available = await pool.query(
    `
      SELECT COALESCE(SUM(qty_available), 0) AS qty_available
      FROM material_batches
      WHERE material_id = $1
        AND warehouse_id = $2
    `
    ,
    [IDS.materialSugar, IDS.warehouseId]
  )

  assert.equal(Number(available.rows[0]?.qty_available), 10)

  const issueMovements = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM stock_movements
      WHERE reference_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    `
  )

  assert.equal(issueMovements.rows[0]?.count, 0)
  await pool.end()
})

test('POST /production-orders/:id/complete should be idempotent', async () => {
  const { app, pool } = await setupApp()

  const createOrderResponse = await request(app as Express)
    .post('/api/v1/production-orders')
    .set(headers)
    .send({
      warehouseId: IDS.warehouseId,
      orderNo: 'PO-001',
      finishedGoodId: IDS.finishedGood,
      recipeId: IDS.recipeId,
      plannedQty: 50
    })

  assert.equal(createOrderResponse.status, 201)
  const orderId = createOrderResponse.body.data.id as string

  const completePayload = {
    actualQty: 48,
    movedAt: '2026-05-03T00:00:00.000Z',
    outputUnitCost: 12
  }

  const first = await request(app as Express)
    .post(`/api/v1/production-orders/${orderId}/complete`)
    .set(headers)
    .set('Idempotency-Key', 'idem-complete-1')
    .send(completePayload)

  const second = await request(app as Express)
    .post(`/api/v1/production-orders/${orderId}/complete`)
    .set(headers)
    .set('Idempotency-Key', 'idem-complete-1')
    .send(completePayload)

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)

  const movementCount = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM stock_movements
      WHERE reference_id = $1
        AND movement_type = 'PRODUCTION_OUTPUT'
    `,
    [orderId]
  )

  assert.equal(movementCount.rows[0]?.count, 1)
  await pool.end()
})

test('POST /inventory/receipts should reject reused key with different payload', async () => {
  const { app, pool } = await setupApp()

  const first = await request(app as Express)
    .post('/api/v1/inventory/receipts')
    .set(headers)
    .set('Idempotency-Key', 'idem-receipt-conflict-1')
    .send({
      receiptId: 'abababab-abab-4bab-8bab-abababababab',
      warehouseId: IDS.warehouseId,
      receivedAt: '2026-05-05T00:00:00.000Z',
      items: [
        {
          materialId: IDS.materialSugar,
          batchNo: 'SUGAR-C1',
          quantity: 30,
          unitPrice: 10
        }
      ]
    })

  const second = await request(app as Express)
    .post('/api/v1/inventory/receipts')
    .set(headers)
    .set('Idempotency-Key', 'idem-receipt-conflict-1')
    .send({
      receiptId: 'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc',
      warehouseId: IDS.warehouseId,
      receivedAt: '2026-05-05T00:00:00.000Z',
      items: [
        {
          materialId: IDS.materialSugar,
          batchNo: 'SUGAR-C2',
          quantity: 90,
          unitPrice: 10
        }
      ]
    })

  assert.equal(first.status, 201)
  assert.equal(second.status, 409)
  assert.equal(second.body.error.code, 'CONFLICT')

  const movementCount = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM stock_movements
      WHERE movement_type = 'RECEIPT'
        AND material_batch_id IS NOT NULL
    `
  )

  assert.equal(Number(movementCount.rows[0]?.count), 1)
  await pool.end()
})
