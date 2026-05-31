import { NotFoundError } from '../../core/errors'
import type { AuthContext, Recipe } from '../../core/types'
import type { RecipeRepository } from '../../core/repositories'
import { requirePermission } from '../auth'

type RecipeServiceDependencies = {
  recipeRepository: RecipeRepository
}

type CreateRecipeInput = {
  id: string
  plantId: string
  finishedGoodId: string
  name: string
  lossRatePercent: number
  items: Array<{
    materialId: string
    qtyPerUnit: number
  }>
}

export const recipeModuleBoundaries = {
  name: 'recipes',
  responsibilities: [
    'Manage BOM/recipe versioning',
    'Protect recipe access with recipe.view and recipe.manage',
    'Track recipe change logs for audit'
  ],
  outOfScope: [
    'Stock movement posting',
    'Procurement receipts'
  ]
} as const

const maskRecipeForLimitedView = (recipe: Recipe): Recipe => {
  return {
    ...recipe,
    items: recipe.items.map((item) => ({
      ...item,
      qtyPerUnit: Number(item.qtyPerUnit.toFixed(3))
    }))
  }
}

export const createRecipeService = ({ recipeRepository }: RecipeServiceDependencies) => {
  const getRecipeById = async (auth: AuthContext, recipeId: string) => {
    requirePermission(auth, 'recipe.view')
    const recipe = await recipeRepository.getRecipeById(recipeId)

    if (!recipe) {
      throw new NotFoundError('Recipe')
    }

    if (auth.permissions.includes('recipe.manage')) {
      return recipe
    }

    return maskRecipeForLimitedView(recipe)
  }

  const createRecipe = async (auth: AuthContext, input: CreateRecipeInput) => {
    requirePermission(auth, 'recipe.manage')
    const now = new Date().toISOString()
    const latestVersion = await recipeRepository.getLatestVersionByFinishedGood(input.finishedGoodId)
    const recipe: Recipe = {
      id: input.id,
      plantId: input.plantId,
      finishedGoodId: input.finishedGoodId,
      name: input.name,
      versionNo: latestVersion + 1,
      lossRatePercent: input.lossRatePercent,
      items: input.items,
      updatedAt: now
    }

    await recipeRepository.saveRecipe(recipe)
    return recipe
  }

  const updateRecipe = async (
    auth: AuthContext,
    recipeId: string,
    input: Pick<CreateRecipeInput, 'name' | 'items'> & { lossRatePercent?: number }
  ) => {
    requirePermission(auth, 'recipe.manage')
    const existing = await recipeRepository.getRecipeById(recipeId)
    if (!existing) {
      throw new NotFoundError('Recipe')
    }

    const recipe: Recipe = {
      ...existing,
      name: input.name,
      lossRatePercent: input.lossRatePercent ?? existing.lossRatePercent,
      items: input.items,
      versionNo: existing.versionNo + 1,
      updatedAt: new Date().toISOString()
    }

    await recipeRepository.saveRecipe(recipe)
    return recipe
  }

  return {
    getRecipeById,
    createRecipe,
    updateRecipe
  }
}
