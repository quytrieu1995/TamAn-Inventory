import { DataType, newDb } from 'pg-mem'
import type { Pool } from 'pg'

const testSchemaSql = `
  CREATE TYPE movement_type AS ENUM (
    'RECEIPT',
    'ISSUE',
    'ADJUSTMENT_PLUS',
    'ADJUSTMENT_MINUS',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'PRODUCTION_CONSUME',
    'PRODUCTION_OUTPUT',
    'DISPOSAL'
  );

  CREATE TYPE production_status AS ENUM (
    'DRAFT',
    'RELEASED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
  );

  CREATE TABLE plants (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );

  CREATE TABLE warehouses (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE materials (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    uom TEXT NOT NULL,
    minimum_stock NUMERIC(16, 3) NOT NULL DEFAULT 0,
    max_storage_days INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE finished_goods (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    uom TEXT NOT NULL
  );

  CREATE TABLE recipes (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    finished_good_id UUID NOT NULL REFERENCES finished_goods(id),
    version_no INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE recipe_items (
    id UUID PRIMARY KEY,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id),
    qty_per_unit NUMERIC(16, 6) NOT NULL
  );

  CREATE TABLE material_batches (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    material_id UUID NOT NULL REFERENCES materials(id),
    batch_no TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    qty_received NUMERIC(16, 3) NOT NULL,
    qty_available NUMERIC(16, 3) NOT NULL,
    unit_price NUMERIC(16, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE stock_movements (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    material_id UUID REFERENCES materials(id),
    finished_good_id UUID REFERENCES finished_goods(id),
    material_batch_id UUID REFERENCES material_batches(id),
    movement_type movement_type NOT NULL,
    direction SMALLINT NOT NULL,
    quantity NUMERIC(16, 3) NOT NULL,
    unit_cost NUMERIC(16, 2) NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id UUID NOT NULL,
    moved_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE production_orders (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    order_no TEXT NOT NULL,
    finished_good_id UUID NOT NULL REFERENCES finished_goods(id),
    recipe_id UUID NOT NULL REFERENCES recipes(id),
    planned_qty NUMERIC(16, 3) NOT NULL,
    actual_qty NUMERIC(16, 3) NOT NULL DEFAULT 0,
    status production_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE alerts (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    material_id UUID REFERENCES materials(id),
    material_batch_id UUID REFERENCES material_batches(id),
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE monthly_snapshots (
    id UUID PRIMARY KEY,
    plant_id UUID NOT NULL REFERENCES plants(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    month_key DATE NOT NULL,
    total_receipt_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_issue_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_disposal_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ending_inventory_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ending_inventory_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE idempotency_keys (
    idempotency_key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (idempotency_key, endpoint)
  );
`

export const createTestPool = async (): Promise<Pool> => {
  const memoryDb = newDb({
    autoCreateForeignKeyIndices: true
  })

  memoryDb.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => {
      return crypto.randomUUID()
    }
  })

  const adapter = memoryDb.adapters.createPg()
  const pool = new adapter.Pool()
  await pool.query(testSchemaSql)

  return pool
}
