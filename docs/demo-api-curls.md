# Demo API Curls (End-to-End)

Tai lieu nay la bo lenh curl san de QA test nhanh luong:

1. Receipt (nhap kho)
2. Issue (xuat kho FIFO)
3. Production Complete (hoan thanh lenh san xuat)
4. Report (dashboard + monthly snapshot)

## 0) Preconditions

- Backend dang chay local: `http://127.0.0.1:4000`
- Da migrate + seed:
  - `npm run db:migrate`
  - `npm run db:seed-demo`

Mo web local de check nhanh server:

- [http://127.0.0.1:4000/health](http://127.0.0.1:4000/health)

## 1) Export bien moi truong test

```bash
export API_BASE="http://127.0.0.1:4000/api/v1"
export PLANT_ID="11111111-1111-4111-8111-111111111111"
export WAREHOUSE_ID="22222222-2222-4222-8222-222222222222"
export FG_ID="55555555-5555-4555-8555-555555555555"
export RECIPE_ID="66666666-6666-4666-8666-666666666666"

export MATERIAL_SUGAR_ID="33333333-3333-4333-8333-333333333333"
export MATERIAL_FLOUR_ID="44444444-4444-4444-8444-444444444444"
export MATERIAL_BUTTER_ID="12121212-1212-4212-8212-121212121212"

export COMMON_HEADERS=(
  -H "x-user-id: 77777777-7777-4777-8777-777777777777"
  -H "x-plant-id: ${PLANT_ID}"
  -H "x-warehouse-ids: ${WAREHOUSE_ID}"
  -H "Content-Type: application/json"
)
```

## 2) Receipt - nhap kho

```bash
curl -sS -X POST "${API_BASE}/inventory/receipts" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: inventory.receive" \
  -H "Idempotency-Key: qa-receipt-001" \
  -d '{
    "receiptId": "f1000000-0000-4000-8000-000000000001",
    "warehouseId": "'"${WAREHOUSE_ID}"'",
    "receivedAt": "2026-05-30T09:00:00.000Z",
    "items": [
      {
        "materialId": "'"${MATERIAL_SUGAR_ID}"'",
        "batchNo": "SUGAR-QA-001",
        "quantity": 120,
        "unitPrice": 22500
      },
      {
        "materialId": "'"${MATERIAL_FLOUR_ID}"'",
        "batchNo": "FLOUR-QA-001",
        "quantity": 80,
        "unitPrice": 15500
      }
    ]
  }'
```

## 3) Issue - xuat kho FIFO

```bash
curl -sS -X POST "${API_BASE}/inventory/issues" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: inventory.issue" \
  -H "Idempotency-Key: qa-issue-001" \
  -d '{
    "warehouseId": "'"${WAREHOUSE_ID}"'",
    "referenceType": "MANUAL_ISSUE",
    "referenceId": "f2000000-0000-4000-8000-000000000001",
    "movedAt": "2026-05-30T10:00:00.000Z",
    "items": [
      {
        "materialId": "'"${MATERIAL_SUGAR_ID}"'",
        "quantity": 40
      }
    ]
  }'
```

## 4) Production order + complete

### 4.1 Tao lenh san xuat moi

```bash
curl -sS -X POST "${API_BASE}/production-orders" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: production.create" \
  -d '{
    "warehouseId": "'"${WAREHOUSE_ID}"'",
    "orderNo": "PO-QA-0002",
    "finishedGoodId": "'"${FG_ID}"'",
    "recipeId": "'"${RECIPE_ID}"'",
    "plannedQty": 50
  }'
```

Ghi lai `data.id` tu response vao bien `ORDER_ID`.

```bash
export ORDER_ID="<paste-production-order-id>"
```

### 4.2 Consume NVL theo BOM

```bash
curl -sS -X POST "${API_BASE}/production-orders/${ORDER_ID}/consume" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: production.create" \
  -d '{
    "movedAt": "2026-05-30T11:00:00.000Z"
  }'
```

### 4.3 Complete lenh san xuat (idempotent)

```bash
curl -sS -X POST "${API_BASE}/production-orders/${ORDER_ID}/complete" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: production.create" \
  -H "Idempotency-Key: qa-complete-001" \
  -d '{
    "actualQty": 48,
    "movedAt": "2026-05-30T12:00:00.000Z",
    "outputUnitCost": 29800
  }'
```

## 5) Report

### 5.1 Dashboard

```bash
curl -sS "${API_BASE}/reports/dashboard?warehouseId=${WAREHOUSE_ID}" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: report.view"
```

### 5.2 Rebuild monthly snapshot

```bash
curl -sS -X POST "${API_BASE}/reports/monthly-snapshot/rebuild" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: report.manage" \
  -d '{
    "monthKey": "2026-05",
    "warehouseId": "'"${WAREHOUSE_ID}"'"
  }'
```

## 6) Kiem tra ledger sau E2E

```bash
curl -sS "${API_BASE}/inventory/ledger?warehouseId=${WAREHOUSE_ID}" \
  "${COMMON_HEADERS[@]}" \
  -H "x-permissions: inventory.issue"
```

## 7) Notes cho QA

- Endpoint co `Idempotency-Key`:
  - `/inventory/receipts`
  - `/inventory/issues`
  - `/production-orders/:id/complete`
- Neu test retry, giu nguyen body + giu nguyen `Idempotency-Key`.
- Neu can test conflict key reuse, gui body khac voi cung key -> ky vong `409 CONFLICT`.
