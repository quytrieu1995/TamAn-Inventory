import { createAlertWorker } from './jobs/alert-worker'
import type { FoodInventoryRepositories } from './core/repositories'
import { createFinishedGoodsService } from './modules/finished-goods'
import { createInventoryService } from './modules/inventory'
import { createRecipeService } from './modules/recipes'
import { createReportService } from './modules/reports'

export const createApplicationServices = (repositories: FoodInventoryRepositories) => {
  const recipeService = createRecipeService({
    recipeRepository: repositories.recipe
  })

  const inventoryService = createInventoryService({
    inventoryRepository: repositories.inventory
  })

  const finishedGoodsService = createFinishedGoodsService({
    inventoryRepository: repositories.inventory,
    recipeRepository: repositories.recipe,
    productionRepository: repositories.production
  })

  const reportService = createReportService({
    inventoryRepository: repositories.inventory,
    snapshotRepository: repositories.snapshot
  })

  const alertWorker = createAlertWorker(
    {
      inventoryRepository: repositories.inventory,
      alertRepository: repositories.alert,
      mailService: {
        send: async (input) => {
          console.log(`[mail] to=${input.to.join(',')} subject=${input.subject}`)
        }
      }
    },
    {}
  )

  return {
    recipeService,
    inventoryService,
    finishedGoodsService,
    reportService,
    alertWorker
  }
}
