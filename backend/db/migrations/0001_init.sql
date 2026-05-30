BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE TYPE alert_type AS ENUM (
  'LOW_STOCK',
  'OVER_STORAGE_DAYS'
);

CREATE TYPE production_status AS ENUM (
  'DRAFT',
  'RELEASED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plant_id, code)
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  plant_id UUID REFERENCES plants(id),
  warehouse_id UUID REFERENCES warehouses(id),
  PRIMARY KEY (user_id, role_id, plant_id, warehouse_id)
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  payment_terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plant_id, code)
);

CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  uom TEXT NOT NULL,
  minimum_stock NUMERIC(16, 3) NOT NULL DEFAULT 0,
  max_storage_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plant_id, code)
);

CREATE TABLE purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  supplier_id UUID REFERENCES suppliers(id),
  receipt_no TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plant_id, receipt_no)
);

CREATE TABLE purchase_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  batch_no TEXT NOT NULL,
  quantity NUMERIC(16, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(16, 2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(18, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE TABLE material_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  receipt_item_id UUID REFERENCES purchase_receipt_items(id),
  batch_no TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  qty_received NUMERIC(16, 3) NOT NULL CHECK (qty_received > 0),
  qty_available NUMERIC(16, 3) NOT NULL CHECK (qty_available >= 0),
  unit_price NUMERIC(16, 2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, material_id, batch_no)
);

CREATE TABLE finished_goods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  uom TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plant_id, code)
);

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id),
  version_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finished_good_id, version_no)
);

CREATE TABLE recipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  qty_per_unit NUMERIC(16, 6) NOT NULL CHECK (qty_per_unit > 0),
  scrap_ratio NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (scrap_ratio >= 0),
  UNIQUE (recipe_id, material_id)
);

CREATE TABLE recipe_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_note TEXT NOT NULL
);

CREATE TABLE production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  order_no TEXT NOT NULL,
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id),
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  planned_qty NUMERIC(16, 3) NOT NULL CHECK (planned_qty > 0),
  actual_qty NUMERIC(16, 3) NOT NULL DEFAULT 0 CHECK (actual_qty >= 0),
  status production_status NOT NULL DEFAULT 'DRAFT',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plant_id, order_no)
);

CREATE TABLE production_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  batch_id UUID REFERENCES material_batches(id),
  quantity NUMERIC(16, 3) NOT NULL CHECK (quantity > 0),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE finished_good_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id),
  production_order_id UUID REFERENCES production_orders(id),
  batch_no TEXT NOT NULL,
  produced_at TIMESTAMPTZ NOT NULL,
  qty_received NUMERIC(16, 3) NOT NULL CHECK (qty_received > 0),
  qty_available NUMERIC(16, 3) NOT NULL CHECK (qty_available >= 0),
  unit_cost NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, finished_good_id, batch_no)
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  material_id UUID REFERENCES materials(id),
  finished_good_id UUID REFERENCES finished_goods(id),
  material_batch_id UUID REFERENCES material_batches(id),
  finished_good_batch_id UUID REFERENCES finished_good_batches(id),
  movement_type movement_type NOT NULL,
  direction SMALLINT NOT NULL CHECK (direction IN (-1, 1)),
  quantity NUMERIC(16, 3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference_type TEXT NOT NULL,
  reference_id UUID,
  reason TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  material_id UUID REFERENCES materials(id),
  material_batch_id UUID REFERENCES material_batches(id),
  alert_type alert_type NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE monthly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID REFERENCES warehouses(id),
  month_key DATE NOT NULL,
  total_receipt_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_issue_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_disposal_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ending_inventory_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ending_inventory_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plant_id, warehouse_id, month_key)
);

CREATE TABLE inventory_balances (
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  quantity_on_hand NUMERIC(16, 3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plant_id, warehouse_id, material_id)
);

CREATE TABLE finished_good_balances (
  plant_id UUID NOT NULL REFERENCES plants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  finished_good_id UUID NOT NULL REFERENCES finished_goods(id),
  quantity_on_hand NUMERIC(16, 3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plant_id, warehouse_id, finished_good_id)
);

CREATE INDEX idx_material_batches_fifo
  ON material_batches (warehouse_id, material_id, received_at, id)
  WHERE qty_available > 0;

CREATE INDEX idx_stock_movements_material_time
  ON stock_movements (plant_id, warehouse_id, material_id, moved_at DESC);

CREATE INDEX idx_stock_movements_fg_time
  ON stock_movements (plant_id, warehouse_id, finished_good_id, moved_at DESC);

CREATE INDEX idx_purchase_receipt_items_material
  ON purchase_receipt_items (material_id);

CREATE INDEX idx_alerts_open
  ON alerts (plant_id, warehouse_id, alert_type, status)
  WHERE status = 'OPEN';

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plants_updated_at
BEFORE UPDATE ON plants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_warehouses_updated_at
BEFORE UPDATE ON warehouses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_materials_updated_at
BEFORE UPDATE ON materials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_purchase_receipts_updated_at
BEFORE UPDATE ON purchase_receipts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_finished_goods_updated_at
BEFORE UPDATE ON finished_goods
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recipes_updated_at
BEFORE UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_production_orders_updated_at
BEFORE UPDATE ON production_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
