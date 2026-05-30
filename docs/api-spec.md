# API Specification - Food Inventory Web (v1)

## 1. Convention

- Base URL: `/api/v1`
- Auth: `Authorization: Bearer <token>`
- Content type: `application/json`
- Multi-tenant headers:
  - `x-plant-id` (required)
  - `x-warehouse-id` (optional theo role scope)

Response mau:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error mau:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Missing permission recipe.view"
  }
}
```

## 2. Auth & RBAC

### GET `/auth/me`
- Tra ve profile, role, permissions, scope

### GET `/auth/permissions`
- Danh sach permission cua user hien tai

## 3. Master data

### Materials

#### GET `/materials`
- Query: `q`, `isActive`, `page`, `pageSize`

#### POST `/materials`
- Permission: `material.manage`
- Body:
```json
{
  "code": "SUGAR001",
  "name": "Duong tinh luyen",
  "uom": "kg",
  "minimumStock": 200,
  "maxStorageDays": 90
}
```

### Suppliers

#### GET `/suppliers`

#### POST `/suppliers`
- Permission: `supplier.manage`

## 4. Inventory

### POST `/inventory/receipts`
- Permission: `inventory.receive`
- Tao phieu nhap + lo nhap
- Body:
```json
{
  "supplierId": "uuid",
  "receiptNo": "PNK-2026-0001",
  "receivedAt": "2026-05-30T10:00:00Z",
  "items": [
    {
      "materialId": "uuid",
      "batchNo": "BATCH-SUGAR-0001",
      "quantity": 500,
      "unitPrice": 22000
    }
  ]
}
```

### POST `/inventory/issues`
- Permission: `inventory.issue`
- Xuat kho theo FIFO
- Body:
```json
{
  "referenceType": "PRODUCTION",
  "referenceId": "uuid",
  "items": [
    {
      "materialId": "uuid",
      "quantity": 120
    }
  ]
}
```

### POST `/inventory/adjustments`
- Permission: `inventory.adjust`
- Huy/kiem ke/bo sung ton co ly do

### GET `/inventory/stocks`
- Ton hien tai theo material, warehouse
- Query: `materialId`, `warehouseId`

### GET `/inventory/ledger`
- Query: `materialId`, `from`, `to`, `movementType`

## 5. Recipes (BOM)

### GET `/recipes`
- Permission: `recipe.view`

### GET `/recipes/:id`
- Permission: `recipe.view`

### POST `/recipes`
- Permission: `recipe.manage`
- Body:
```json
{
  "code": "FG-COOKIE-001",
  "name": "Banh quy bo",
  "items": [
    {
      "materialId": "uuid",
      "qtyPerUnit": 0.12
    }
  ]
}
```

### PUT `/recipes/:id`
- Permission: `recipe.manage`
- Bat buoc ghi recipe change log

## 6. Production / Finished goods

### POST `/production-orders`
- Permission: `production.create`
- Tao lenh san xuat tu recipe

### POST `/production-orders/:id/consume`
- Permission: `production.create`
- Consume NVL theo BOM (goi inventory issue FIFO)

### POST `/production-orders/:id/complete`
- Permission: `production.create`
- Nhap kho thanh pham

### GET `/finished-goods/stocks`
- Permission: `report.view` hoac `inventory.view`

## 7. Reports

### GET `/reports/dashboard`
- KPI tong quan theo kho/nha may

### GET `/reports/monthly`
- Query:
  - `month` (YYYY-MM)
  - `warehouseId` (optional)
- Tra ve:
  - Tong nhap
  - Tong xuat
  - Tong huy
  - Chi phi NVL
  - Ton cuoi ky

### POST `/reports/monthly-snapshot/rebuild`
- Permission: `report.manage`
- Trigger rebuild snapshot ky thang

## 8. Alerts

### GET `/alerts`
- Danh sach canh bao ton thap/luu kho qua nguong

### POST `/alerts/settings`
- Permission: `alert.manage`
- Cap nhat nguong canh bao theo kho/NVL

## 9. Idempotency va concurrency

- Cac endpoint ghi du lieu quan trong (`/inventory/receipts`, `/inventory/issues`, `/production-orders/:id/complete`) ho tro `Idempotency-Key`
- Inventory issue su dung row-level lock de tranh race condition FIFO

## 10. HTTP status code

- `200`: thanh cong
- `201`: tao moi thanh cong
- `400`: du lieu dau vao khong hop le
- `401`: chua dang nhap/het han token
- `403`: thieu permission
- `404`: khong tim thay doi tuong
- `409`: xung dot du lieu (vd: ton khong du)
- `422`: nghiep vu khong hop le
- `500`: loi he thong
