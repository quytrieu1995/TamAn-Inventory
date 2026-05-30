# Food Inventory Web

MVP foundation for multi-plant, multi-warehouse food material and finished-goods management.

## What is included

- Solution architecture and API contract
- PostgreSQL schema migration for inventory, FIFO, BOM, RBAC, reports, alerts
- Backend domain services:
  - RBAC helpers and permission checks
  - Recipe/BOM security with view/manage split
  - FIFO receive/issue/adjust inventory flow
  - Production order consume/complete flow
  - Monthly dashboard and snapshot report service
  - Alert worker for low stock and over storage days with mail integration
- Frontend pages for dashboard, materials, recipes, finished goods, and reports
- UAT, reconciliation, and go-live checklist

## Key paths

- `docs/solution-architecture.md`
- `docs/api-spec.md`
- `docs/uat-go-live-checklist.md`
- `backend/db/migrations/0001_init.sql`
- `backend/src/http/routes.ts`
- `backend/src/db/postgres-repositories.ts`
- `backend/src/server.ts`
- `backend/src/http/idempotency.ts`
- `backend/src/tests/integration/api.integration.test.ts`
- `frontend/src/app`

## Run backend

1. Copy env template
   - `cp .env.example .env`
2. Set your PostgreSQL connection in `.env`
3. Run migration
   - `npm run db:migrate`
4. Start API in development
   - `npm run dev`
5. Run integration tests
   - `npm test`
6. Run idempotency cleanup manually
   - `npm run idempotency:cleanup`

Required request headers for protected APIs:
- `x-plant-id`
- `x-user-id` (optional, defaults to `anonymous`)
- `x-permissions` (comma-separated, example `recipe.view,inventory.issue`)
- `x-warehouse-ids` (comma-separated warehouse scope)
- `Idempotency-Key` for write endpoints:
  - `POST /api/v1/inventory/receipts`
  - `POST /api/v1/inventory/issues`
  - `POST /api/v1/production-orders/:id/complete`

Idempotency cleanup hardening:
- `ENABLE_IDEMPOTENCY_CLEANUP_CRON=true|false`
- `IDEMPOTENCY_CLEANUP_CRON` (default hourly)
- `IDEMPOTENCY_TTL_HOURS` (default 24h)
