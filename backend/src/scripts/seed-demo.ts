import { dbPool } from '../db/pool'
import { hashPassword } from '../core/password'

const DEMO = {
  plantId: '11111111-1111-4111-8111-111111111111',
  warehouseId: '22222222-2222-4222-8222-222222222222',
  supplierId: '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a',
  materials: {
    sugar: '33333333-3333-4333-8333-333333333333',
    flour: '44444444-4444-4444-8444-444444444444',
    butter: '12121212-1212-4212-8212-121212121212'
  },
  finishedGoodId: '55555555-5555-4555-8555-555555555555',
  recipeId: '66666666-6666-4666-8666-666666666666',
  receipts: {
    r1: '88888888-8888-4888-8888-888888888888',
    r2: '99999999-9999-4999-8999-999999999999'
  },
  receiptItems: {
    i1: 'aaaa1111-aaaa-4111-8111-aaaaaaaa1111',
    i2: 'aaaa2222-aaaa-4222-8222-aaaaaaaa2222',
    i3: 'aaaa3333-aaaa-4333-8333-aaaaaaaa3333',
    i4: 'aaaa4444-aaaa-4444-8444-aaaaaaaa4444'
  },
  batches: {
    sugarB1: 'bbbb1111-bbbb-4111-8111-bbbbbbbb1111',
    sugarB2: 'bbbb2222-bbbb-4222-8222-bbbbbbbb2222',
    flourB1: 'bbbb3333-bbbb-4333-8333-bbbbbbbb3333',
    butterB1: 'bbbb4444-bbbb-4444-8444-bbbbbbbb4444'
  },
  productionOrderId: 'cccc1111-cccc-4111-8111-cccccccc1111',
  finishedGoodBatchId: 'dddd1111-dddd-4111-8111-dddddddd1111',
  users: {
    admin: '77777777-7777-4777-8777-777777777777',
    operator: '88888888-1111-4111-8111-888888888888'
  },
  roles: {
    admin: 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1',
    operator: 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2',
    recipeManager: 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3'
  },
  references: {
    manualIssue: 'eeee1111-eeee-4111-8111-eeeeeeee1111'
  }
} as const

const run = async () => {
  const client = await dbPool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      "DELETE FROM idempotency_keys WHERE endpoint = ANY($1::text[])",
      [['/inventory/receipts', '/inventory/issues', '/production-orders/complete']]
    )

    await client.query(
      'DELETE FROM production_consumptions WHERE production_order_id IN (SELECT id FROM production_orders WHERE plant_id = $1)',
      [DEMO.plantId]
    )
    await client.query('DELETE FROM stock_movements WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM finished_good_batches WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM material_batches WHERE plant_id = $1', [DEMO.plantId])
    await client.query(
      'DELETE FROM purchase_receipt_items WHERE receipt_id IN (SELECT id FROM purchase_receipts WHERE plant_id = $1)',
      [DEMO.plantId]
    )
    await client.query('DELETE FROM purchase_receipts WHERE plant_id = $1', [DEMO.plantId])
    await client.query(
      'DELETE FROM recipe_change_logs WHERE recipe_id IN (SELECT id FROM recipes WHERE plant_id = $1)',
      [DEMO.plantId]
    )
    await client.query(
      'DELETE FROM recipe_items WHERE recipe_id IN (SELECT id FROM recipes WHERE plant_id = $1)',
      [DEMO.plantId]
    )
    await client.query('DELETE FROM production_orders WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM recipes WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM monthly_snapshots WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM alerts WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM inventory_balances WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM finished_good_balances WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM user_roles WHERE plant_id = $1 OR plant_id IS NULL', [DEMO.plantId])
    await client.query('DELETE FROM finished_goods WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM materials WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM suppliers WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM warehouses WHERE plant_id = $1', [DEMO.plantId])
    await client.query('DELETE FROM plants WHERE id = $1', [DEMO.plantId])
    await client.query("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code LIKE 'DEMO_%')")
    await client.query("DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE code LIKE 'DEMO_%')")
    await client.query("DELETE FROM roles WHERE code LIKE 'DEMO_%'")
    await client.query(
      `
        DELETE FROM role_permissions
        WHERE permission_id IN (
          SELECT id FROM permissions
          WHERE code IN ('recipe.view','recipe.manage','inventory.receive','inventory.issue','inventory.adjust','production.create','report.view','report.manage','supplier.manage','material.manage','user.manage')
        )
      `
    )
    await client.query("DELETE FROM permissions WHERE code IN ('recipe.view','recipe.manage','inventory.receive','inventory.issue','inventory.adjust','production.create','report.view','report.manage','supplier.manage','material.manage','user.manage')")
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[DEMO.users.admin, DEMO.users.operator]])

    await client.query('INSERT INTO plants (id, code, name) VALUES ($1, $2, $3)', [DEMO.plantId, 'PLANT-DEMO', 'Nha may demo'])
    await client.query('INSERT INTO warehouses (id, plant_id, code, name) VALUES ($1, $2, $3, $4)', [DEMO.warehouseId, DEMO.plantId, 'WH-DEMO', 'Kho trung tam'])
    await client.query(
      'INSERT INTO suppliers (id, plant_id, code, name, contact_name, email, payment_terms) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [DEMO.supplierId, DEMO.plantId, 'SUP-DEMO', 'Nha cung cap Demo', 'Le Van A', 'supplier.demo@taman.local', 'Net 30']
    )

    const permissionCodes = [
      ['recipe.view', 'Xem cong thuc'],
      ['recipe.manage', 'Quan ly cong thuc'],
      ['inventory.receive', 'Nhap kho NVL'],
      ['inventory.issue', 'Xuat kho NVL'],
      ['inventory.adjust', 'Dieu chinh huy NVL'],
      ['production.create', 'Tao lenh san xuat'],
      ['report.view', 'Xem bao cao'],
      ['report.manage', 'Quan ly bao cao'],
      ['supplier.manage', 'Quan ly nha cung cap'],
      ['material.manage', 'Quan ly nguyen lieu'],
      ['user.manage', 'Quan ly nguoi dung va phan quyen']
    ] as const

    for (const permission of permissionCodes) {
      await client.query(
        'INSERT INTO permissions (id, code, description) VALUES (gen_random_uuid(), $1, $2)',
        [permission[0], permission[1]]
      )
    }

    await client.query(
      'INSERT INTO roles (id, code, name) VALUES ($1, $2, $3)',
      [DEMO.roles.admin, 'DEMO_ADMIN', 'Quan tri he thong']
    )
    await client.query(
      'INSERT INTO roles (id, code, name) VALUES ($1, $2, $3)',
      [DEMO.roles.operator, 'DEMO_OPERATOR', 'Nhan vien kho van']
    )
    await client.query(
      'INSERT INTO roles (id, code, name) VALUES ($1, $2, $3)',
      [DEMO.roles.recipeManager, 'DEMO_RECIPE_MANAGER', 'Chuyen vien cong thuc']
    )

    await client.query(
      `
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT $1, id FROM permissions
        WHERE code IN ('recipe.view','recipe.manage','inventory.receive','inventory.issue','inventory.adjust','production.create','report.view','report.manage','supplier.manage','material.manage','user.manage')
      `,
      [DEMO.roles.admin]
    )
    await client.query(
      `
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT $1, id FROM permissions
        WHERE code IN ('inventory.receive','inventory.issue','inventory.adjust','production.create','report.view','supplier.manage','material.manage')
      `,
      [DEMO.roles.operator]
    )
    await client.query(
      `
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT $1, id FROM permissions
        WHERE code IN ('recipe.view','recipe.manage','report.view')
      `,
      [DEMO.roles.recipeManager]
    )

    await client.query(
      'INSERT INTO users (id, email, full_name, password_hash, is_active) VALUES ($1, $2, $3, $4, true)',
      [DEMO.users.admin, 'admin@taman.local', 'Quan tri demo', hashPassword('123456')]
    )
    await client.query(
      'INSERT INTO users (id, email, full_name, password_hash, is_active) VALUES ($1, $2, $3, $4, true)',
      [DEMO.users.operator, 'operator@taman.local', 'Van hanh demo', hashPassword('123456')]
    )

    await client.query(
      'INSERT INTO user_roles (user_id, role_id, plant_id, warehouse_id) VALUES ($1, $2, $3, $4)',
      [DEMO.users.admin, DEMO.roles.admin, DEMO.plantId, DEMO.warehouseId]
    )
    await client.query(
      'INSERT INTO user_roles (user_id, role_id, plant_id, warehouse_id) VALUES ($1, $2, $3, $4)',
      [DEMO.users.operator, DEMO.roles.operator, DEMO.plantId, DEMO.warehouseId]
    )

    await client.query(
      'INSERT INTO materials (id, plant_id, code, name, uom, minimum_stock, max_storage_days) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [DEMO.materials.sugar, DEMO.plantId, 'SUGAR001', 'Duong tinh luyen', 'kg', 200, 90]
    )
    await client.query(
      'INSERT INTO materials (id, plant_id, code, name, uom, minimum_stock, max_storage_days) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [DEMO.materials.flour, DEMO.plantId, 'FLOUR001', 'Bot mi so 8', 'kg', 300, 60]
    )
    await client.query(
      'INSERT INTO materials (id, plant_id, code, name, uom, minimum_stock, max_storage_days) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [DEMO.materials.butter, DEMO.plantId, 'BUTTER001', 'Bo lat', 'kg', 120, 45]
    )

    await client.query(
      'INSERT INTO finished_goods (id, plant_id, code, name, uom) VALUES ($1, $2, $3, $4, $5)',
      [DEMO.finishedGoodId, DEMO.plantId, 'FG-COOKIE-001', 'Banh quy bo', 'kg']
    )
    await client.query(
      'INSERT INTO recipes (id, plant_id, finished_good_id, version_no, status) VALUES ($1, $2, $3, 1, $4)',
      [DEMO.recipeId, DEMO.plantId, DEMO.finishedGoodId, 'ACTIVE']
    )
    await client.query(
      'INSERT INTO recipe_items (id, recipe_id, material_id, qty_per_unit, scrap_ratio) VALUES (gen_random_uuid(), $1, $2, $3, 0)',
      [DEMO.recipeId, DEMO.materials.sugar, 0.4]
    )
    await client.query(
      'INSERT INTO recipe_items (id, recipe_id, material_id, qty_per_unit, scrap_ratio) VALUES (gen_random_uuid(), $1, $2, $3, 0)',
      [DEMO.recipeId, DEMO.materials.flour, 0.2]
    )
    await client.query(
      'INSERT INTO recipe_items (id, recipe_id, material_id, qty_per_unit, scrap_ratio) VALUES (gen_random_uuid(), $1, $2, $3, 0)',
      [DEMO.recipeId, DEMO.materials.butter, 0.1]
    )

    await client.query(
      'INSERT INTO purchase_receipts (id, plant_id, warehouse_id, supplier_id, receipt_no, received_at, note) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [DEMO.receipts.r1, DEMO.plantId, DEMO.warehouseId, DEMO.supplierId, 'PNK-DEMO-0001', '2026-05-01T00:00:00.000Z', 'Nhap lo dau thang']
    )
    await client.query(
      'INSERT INTO purchase_receipts (id, plant_id, warehouse_id, supplier_id, receipt_no, received_at, note) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [DEMO.receipts.r2, DEMO.plantId, DEMO.warehouseId, DEMO.supplierId, 'PNK-DEMO-0002', '2026-05-04T00:00:00.000Z', 'Nhap bo sung']
    )

    await client.query(
      'INSERT INTO purchase_receipt_items (id, receipt_id, material_id, batch_no, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6)',
      [DEMO.receiptItems.i1, DEMO.receipts.r1, DEMO.materials.sugar, 'SUGAR-B1', 300, 21000]
    )
    await client.query(
      'INSERT INTO purchase_receipt_items (id, receipt_id, material_id, batch_no, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6)',
      [DEMO.receiptItems.i2, DEMO.receipts.r2, DEMO.materials.sugar, 'SUGAR-B2', 200, 22000]
    )
    await client.query(
      'INSERT INTO purchase_receipt_items (id, receipt_id, material_id, batch_no, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6)',
      [DEMO.receiptItems.i3, DEMO.receipts.r1, DEMO.materials.flour, 'FLOUR-B1', 500, 15000]
    )
    await client.query(
      'INSERT INTO purchase_receipt_items (id, receipt_id, material_id, batch_no, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6)',
      [DEMO.receiptItems.i4, DEMO.receipts.r1, DEMO.materials.butter, 'BUTTER-B1', 200, 53000]
    )

    await client.query(
      'INSERT INTO material_batches (id, plant_id, warehouse_id, material_id, receipt_item_id, batch_no, received_at, qty_received, qty_available, unit_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [DEMO.batches.sugarB1, DEMO.plantId, DEMO.warehouseId, DEMO.materials.sugar, DEMO.receiptItems.i1, 'SUGAR-B1', '2026-05-01T00:00:00.000Z', 300, 220, 21000]
    )
    await client.query(
      'INSERT INTO material_batches (id, plant_id, warehouse_id, material_id, receipt_item_id, batch_no, received_at, qty_received, qty_available, unit_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [DEMO.batches.sugarB2, DEMO.plantId, DEMO.warehouseId, DEMO.materials.sugar, DEMO.receiptItems.i2, 'SUGAR-B2', '2026-05-04T00:00:00.000Z', 200, 170, 22000]
    )
    await client.query(
      'INSERT INTO material_batches (id, plant_id, warehouse_id, material_id, receipt_item_id, batch_no, received_at, qty_received, qty_available, unit_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [DEMO.batches.flourB1, DEMO.plantId, DEMO.warehouseId, DEMO.materials.flour, DEMO.receiptItems.i3, 'FLOUR-B1', '2026-05-01T00:00:00.000Z', 500, 460, 15000]
    )
    await client.query(
      'INSERT INTO material_batches (id, plant_id, warehouse_id, material_id, receipt_item_id, batch_no, received_at, qty_received, qty_available, unit_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [DEMO.batches.butterB1, DEMO.plantId, DEMO.warehouseId, DEMO.materials.butter, DEMO.receiptItems.i4, 'BUTTER-B1', '2026-05-01T00:00:00.000Z', 200, 180, 53000]
    )

    await client.query(
      'INSERT INTO production_orders (id, plant_id, warehouse_id, order_no, finished_good_id, recipe_id, planned_qty, actual_qty, status, started_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [DEMO.productionOrderId, DEMO.plantId, DEMO.warehouseId, 'PO-DEMO-0001', DEMO.finishedGoodId, DEMO.recipeId, 100, 95, 'COMPLETED', '2026-05-10T08:00:00.000Z', '2026-05-10T16:00:00.000Z']
    )

    await client.query(
      'INSERT INTO production_consumptions (id, production_order_id, material_id, batch_id, quantity, consumed_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)',
      [DEMO.productionOrderId, DEMO.materials.sugar, DEMO.batches.sugarB1, 80, '2026-05-10T12:00:00.000Z']
    )
    await client.query(
      'INSERT INTO production_consumptions (id, production_order_id, material_id, batch_id, quantity, consumed_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)',
      [DEMO.productionOrderId, DEMO.materials.flour, DEMO.batches.flourB1, 40, '2026-05-10T12:00:00.000Z']
    )
    await client.query(
      'INSERT INTO production_consumptions (id, production_order_id, material_id, batch_id, quantity, consumed_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)',
      [DEMO.productionOrderId, DEMO.materials.butter, DEMO.batches.butterB1, 20, '2026-05-10T12:00:00.000Z']
    )

    await client.query(
      'INSERT INTO finished_good_batches (id, plant_id, warehouse_id, finished_good_id, production_order_id, batch_no, produced_at, qty_received, qty_available, unit_cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [DEMO.finishedGoodBatchId, DEMO.plantId, DEMO.warehouseId, DEMO.finishedGoodId, DEMO.productionOrderId, 'FG-COOKIE-B1', '2026-05-10T16:00:00.000Z', 95, 95, 29500]
    )

    const materialMovements = [
      [DEMO.materials.sugar, DEMO.batches.sugarB1, 'RECEIPT', 1, 300, 21000, 'PURCHASE_RECEIPT', DEMO.receipts.r1, '2026-05-01T00:00:00.000Z'],
      [DEMO.materials.sugar, DEMO.batches.sugarB2, 'RECEIPT', 1, 200, 22000, 'PURCHASE_RECEIPT', DEMO.receipts.r2, '2026-05-04T00:00:00.000Z'],
      [DEMO.materials.flour, DEMO.batches.flourB1, 'RECEIPT', 1, 500, 15000, 'PURCHASE_RECEIPT', DEMO.receipts.r1, '2026-05-01T00:00:00.000Z'],
      [DEMO.materials.butter, DEMO.batches.butterB1, 'RECEIPT', 1, 200, 53000, 'PURCHASE_RECEIPT', DEMO.receipts.r1, '2026-05-01T00:00:00.000Z'],
      [DEMO.materials.sugar, DEMO.batches.sugarB2, 'ISSUE', -1, 30, 22000, 'MANUAL_ISSUE', DEMO.references.manualIssue, '2026-05-06T09:00:00.000Z'],
      [DEMO.materials.sugar, DEMO.batches.sugarB1, 'PRODUCTION_CONSUME', -1, 80, 21000, 'PRODUCTION', DEMO.productionOrderId, '2026-05-10T12:00:00.000Z'],
      [DEMO.materials.flour, DEMO.batches.flourB1, 'PRODUCTION_CONSUME', -1, 40, 15000, 'PRODUCTION', DEMO.productionOrderId, '2026-05-10T12:00:00.000Z'],
      [DEMO.materials.butter, DEMO.batches.butterB1, 'PRODUCTION_CONSUME', -1, 20, 53000, 'PRODUCTION', DEMO.productionOrderId, '2026-05-10T12:00:00.000Z']
    ] as const

    for (const movement of materialMovements) {
      await client.query(
        `
          INSERT INTO stock_movements (
            id, plant_id, warehouse_id, material_id, material_batch_id, movement_type, direction,
            quantity, unit_cost, reference_type, reference_id, moved_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::movement_type, $6, $7, $8, $9, $10, $11)
        `,
        [
          DEMO.plantId,
          DEMO.warehouseId,
          movement[0],
          movement[1],
          movement[2],
          movement[3],
          movement[4],
          movement[5],
          movement[6],
          movement[7],
          movement[8]
        ]
      )
    }

    await client.query(
      `
        INSERT INTO stock_movements (
          id, plant_id, warehouse_id, finished_good_id, finished_good_batch_id, movement_type, direction,
          quantity, unit_cost, reference_type, reference_id, moved_at
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PRODUCTION_OUTPUT', 1, 95, 29500, 'PRODUCTION_ORDER', $5, '2026-05-10T16:00:00.000Z')
      `,
      [DEMO.plantId, DEMO.warehouseId, DEMO.finishedGoodId, DEMO.finishedGoodBatchId, DEMO.productionOrderId]
    )

    await client.query('COMMIT')
    console.log('Demo data seeded successfully')
    console.log(`Plant ID: ${DEMO.plantId}`)
    console.log(`Warehouse ID: ${DEMO.warehouseId}`)
    console.log(`Recipe ID: ${DEMO.recipeId}`)
    console.log(`Production Order ID: ${DEMO.productionOrderId}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await dbPool.end()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
