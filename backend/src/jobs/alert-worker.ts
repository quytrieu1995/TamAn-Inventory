import { createAlertId } from '../core/memory-store'
import type { AlertRepository, InventoryRepository } from '../core/repositories'
import type { AlertRecord, Material } from '../core/types'

type AlertWorkerConfig = {
  cron: string
  lowStockEnabled: boolean
  overStorageEnabled: boolean
}

type AlertWorkerDependencies = {
  inventoryRepository: InventoryRepository
  alertRepository: AlertRepository
  mailService: {
    send: (input: { to: string[]; subject: string; body: string }) => Promise<void>
  }
}

type MaterialContext = {
  material: Material
  onHandQuantity: number
  oldestBatchAgeDays: number
}

const defaultConfig: AlertWorkerConfig = {
  cron: '0 7 * * *',
  lowStockEnabled: true,
  overStorageEnabled: true
}

const getBatchAgeDays = (receivedAt: string) => {
  const ageMilliseconds = Date.now() - new Date(receivedAt).getTime()
  return Math.floor(ageMilliseconds / (1000 * 60 * 60 * 24))
}

const buildAlerts = (
  plantId: string,
  warehouseId: string,
  materialContexts: MaterialContext[],
  config: AlertWorkerConfig
) => {
  const alerts: AlertRecord[] = []
  const triggeredAt = new Date().toISOString()

  for (const context of materialContexts) {
    if (config.lowStockEnabled && context.onHandQuantity <= context.material.minimumStock) {
      alerts.push({
        id: createAlertId(),
        plantId,
        warehouseId,
        materialId: context.material.id,
        type: 'LOW_STOCK',
        message: `Material ${context.material.code} below minimum stock`,
        triggeredAt
      })
    }

    if (config.overStorageEnabled && context.oldestBatchAgeDays > context.material.maxStorageDays) {
      alerts.push({
        id: createAlertId(),
        plantId,
        warehouseId,
        materialId: context.material.id,
        type: 'OVER_STORAGE_DAYS',
        message: `Material ${context.material.code} exceeded max storage days`,
        triggeredAt
      })
    }
  }

  return alerts
}

export const createAlertWorker = (
  dependencies: AlertWorkerDependencies,
  config: Partial<AlertWorkerConfig> = {}
) => {
  const resolvedConfig: AlertWorkerConfig = {
    ...defaultConfig,
    ...config
  }

  const run = async (input: {
    plantId: string
    warehouseId: string
    materialIds: string[]
    mailTo: string[]
  }) => {
    const materials = await dependencies.inventoryRepository.getMaterialsByIds(input.materialIds)
    const materialContexts: MaterialContext[] = []

    for (const material of materials) {
      const batches = await dependencies.inventoryRepository.listBatchesByWarehouseAndMaterial(
        input.warehouseId,
        material.id
      )
      const onHandQuantity = batches.reduce((accumulator, batch) => accumulator + batch.qtyAvailable, 0)
      const oldestBatchAgeDays = batches.length === 0 ? 0 : Math.max(...batches.map((batch) => getBatchAgeDays(batch.receivedAt)))

      materialContexts.push({
        material,
        onHandQuantity,
        oldestBatchAgeDays
      })
    }

    const alerts = buildAlerts(input.plantId, input.warehouseId, materialContexts, resolvedConfig)
    if (alerts.length > 0) {
      await dependencies.alertRepository.saveAlerts(alerts)
      const lines = alerts.map((alert) => `- [${alert.type}] ${alert.message}`).join('\n')
      await dependencies.mailService.send({
        to: input.mailTo,
        subject: `Inventory alerts (${input.warehouseId})`,
        body: `Detected ${alerts.length} alert(s)\n${lines}`
      })
    }

    return {
      status: 'ok',
      executedAt: new Date().toISOString(),
      alertsCount: alerts.length,
      config: resolvedConfig
    }
  }

  return {
    run,
    config: resolvedConfig
  }
}
