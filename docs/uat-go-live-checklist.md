# UAT, Data Reconciliation, and Go-live Checklist

## 1. UAT scope

Business groups and owner:
- Warehouse: inventory receipt, issue, adjustment, transfer
- Production: create production order, consume by BOM, complete output
- Procurement: supplier and purchase receipt records
- Finance/Accounting: monthly report and valuation check
- IT/Admin: RBAC, recipe security, alert job and mail delivery

## 2. UAT test matrix

### 2.1 Inventory and FIFO

1. Create 3 receipt batches for the same material with different `receivedAt`
2. Trigger issue quantity larger than one batch and verify FIFO allocation order
3. Verify `stock_movements` includes one row per consumed batch
4. Verify `material_batches.qtyAvailable` decreases correctly

Expected result:
- Issue consumes oldest available batch first
- No negative available quantity
- Ledger and batch balances are consistent

### 2.2 Production with BOM

1. Create recipe with at least 3 materials
2. Create production order and consume materials
3. Complete production order with actual output quantity
4. Verify `PRODUCTION_CONSUME` and `PRODUCTION_OUTPUT` movement posting

Expected result:
- Material consumption equals recipe ratio x planned quantity
- Finished good stock increases after completion

### 2.3 Recipe security and RBAC

1. User with `recipe.view` only can read recipe
2. Same user cannot create or update recipe
3. User with `recipe.manage` can create and update recipe version

Expected result:
- Backend returns `403 FORBIDDEN` for missing permission
- Frontend hides edit actions without `recipe.manage`

### 2.4 Alerts

1. Configure material with high `minimumStock`
2. Drop stock below threshold then run alert worker
3. Configure low `maxStorageDays` and test old batch

Expected result:
- Alert records created for low stock and over storage days
- Email is sent with alert summary

### 2.5 Monthly reporting

1. Create receipt, issue, disposal movements in one month
2. Build monthly snapshot
3. Compare report totals with movement ledger manually

Expected result:
- Report totals match movement-derived values
- Month-end inventory quantity and value are consistent

## 3. Data reconciliation checklist

- Compare opening inventory with legacy source by plant and warehouse
- Compare inbound quantities by receipt number and date range
- Compare outbound and disposal totals by material
- Verify FIFO cost valuation for top 20 high-value materials
- Verify finished goods output quantities by production order
- Confirm report totals align with accounting control sheet

## 4. Go-live readiness checklist

### 4.1 System readiness

- Migration `0001_init.sql` deployed successfully
- Backup and restore procedure tested on staging
- Alert worker schedule and mail recipient list configured
- Monitoring and log retention configured

### 4.2 Access and security

- Roles and permissions mapped by department
- Least privilege validation completed
- Recipe endpoints protected and tested for unauthorized access

### 4.3 Operational readiness

- SOP for receipt, issue, adjustment, and production completion published
- Support runbook for incident triage prepared
- End-user training completed with sign-off

### 4.4 Cut-over plan

- Freeze period for legacy transactions defined
- Initial stock import executed and verified
- Hypercare support window and on-call owner assigned
- Rollback criteria and decision owner documented

## 5. Sign-off template

- Warehouse lead: `__name__` `__date__`
- Production lead: `__name__` `__date__`
- Finance lead: `__name__` `__date__`
- IT lead: `__name__` `__date__`
- Project owner: `__name__` `__date__`
