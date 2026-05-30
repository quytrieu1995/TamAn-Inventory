'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  apiClient,
  type MasterMaterial,
  type MasterRecipe
} from '../../lib/api'
import { useSession } from '../../hooks/use-session'

type RecipeItemDraft = {
  materialId: string
  qtyPerUnit: string
}

const RecipesPage = () => {
  const { session } = useSession()
  const [materials, setMaterials] = useState<MasterMaterial[]>([])
  const [recipes, setRecipes] = useState<MasterRecipe[]>([])
  const [recipeName, setRecipeName] = useState('Sản phẩm mới')
  const [productCode, setProductCode] = useState('')
  const [productName, setProductName] = useState('')
  const [productUom, setProductUom] = useState('kg')
  const [recipeItems, setRecipeItems] = useState<RecipeItemDraft[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canViewRecipe = session?.permissions.includes('recipe.view') ?? false
  const canManageRecipe = session?.permissions.includes('recipe.manage') ?? false

  const loadData = async () => {
    const [materialData, recipeData] = await Promise.all([
      apiClient.getMaterialsMaster(),
      apiClient.getRecipesMaster()
    ])
    setMaterials(materialData)
    setRecipes(recipeData)
    if (recipeItems.length === 0 && materialData.length > 0) {
      setRecipeItems([
        {
          materialId: materialData[0].id,
          qtyPerUnit: '0.1'
        }
      ])
    }
  }

  useEffect(() => {
    if (!canViewRecipe) {
      return
    }
    loadData().catch((error) => {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải dữ liệu công thức')
    })
  }, [canViewRecipe])

  const materialMap = useMemo(() => {
    return new Map(materials.map((material) => [material.id, material]))
  }, [materials])

  const validationErrors = useMemo(() => {
    const errors: string[] = []

    const materialIds = recipeItems.map((item) => item.materialId)
    const uniqueMaterialIds = new Set(materialIds)
    if (uniqueMaterialIds.size !== materialIds.length) {
      errors.push('Không được chọn trùng nguyên liệu trong cùng một công thức')
    }

    const quantities = recipeItems.map((item) => Number(item.qtyPerUnit))
    const hasInvalidLine = quantities.some((value) => !Number.isFinite(value) || value <= 0)
    if (hasInvalidLine) {
      errors.push('Mỗi dòng nguyên liệu phải có khối lượng lớn hơn 0')
    }

    const totalQuantity = quantities.reduce((sum, value) => {
      if (!Number.isFinite(value)) {
        return sum
      }
      return sum + value
    }, 0)
    if (totalQuantity <= 0) {
      errors.push('Tổng khối lượng công thức phải lớn hơn 0')
    }

    return errors
  }, [recipeItems])

  const handleRecipeItemChange = (index: number, field: keyof RecipeItemDraft, value: string) => {
    setRecipeItems((previous) => {
      return previous.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item
        }

        return {
          ...item,
          [field]: value
        }
      })
    })
  }

  const handleAddRecipeItem = () => {
    if (materials.length === 0) {
      return
    }

    setRecipeItems((previous) => [
      ...previous,
      {
        materialId: materials[0].id,
        qtyPerUnit: '0.1'
      }
    ])
  }

  const handleRemoveRecipeItem = (index: number) => {
    setRecipeItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleCreateRecipe = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManageRecipe) {
      setFeedback('Bạn không có quyền thêm công thức')
      return
    }
    if (!productCode.trim() || !productName.trim() || !productUom.trim()) {
      setFeedback('Vui lòng nhập đầy đủ mã sản phẩm, tên sản phẩm và đơn vị tính')
      return
    }
    if (recipeItems.length === 0) {
      setFeedback('Công thức cần ít nhất một nguyên liệu')
      return
    }
    if (validationErrors.length > 0) {
      setFeedback(validationErrors[0])
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      await apiClient.createRecipe({
        id: crypto.randomUUID(),
        name: recipeName,
        product: {
          code: productCode.trim(),
          name: productName.trim(),
          uom: productUom.trim()
        },
        items: recipeItems.map((item) => ({
          materialId: item.materialId,
          qtyPerUnit: Number(item.qtyPerUnit)
        }))
      })
      setRecipeName('Sản phẩm mới')
      setProductCode('')
      setProductName('')
      setProductUom('kg')
      if (materials.length > 0) {
        setRecipeItems([
          {
            materialId: materials[0].id,
            qtyPerUnit: '0.1'
          }
        ])
      } else {
        setRecipeItems([])
      }
      await loadData()
      setFeedback('Đã thêm công thức thành công')
    } catch (createError) {
      setFeedback(createError instanceof Error ? createError.message : 'Không thể thêm công thức')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canViewRecipe) {
    return (
      <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Bạn không có quyền xem công thức
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold md:text-3xl">Bảo mật công thức và BOM</h1>
          <p className="muted-text text-sm md:text-base">
            Chỉ tài khoản có quyền mới được truy cập tab và sử dụng chức năng thêm công thức.
          </p>
        </div>
      </header>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Thêm sản phẩm mới và công thức</h2>
        <form onSubmit={handleCreateRecipe} className="grid grid-cols-1 gap-3">
          <label className="text-sm">
            <span>Tên công thức hiển thị</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={recipeName} onChange={(event) => setRecipeName(event.target.value)} />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span>Mã sản phẩm mới</span>
              <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={productCode} onChange={(event) => setProductCode(event.target.value)} />
            </label>
            <label className="text-sm">
              <span>Tên sản phẩm mới</span>
              <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={productName} onChange={(event) => setProductName(event.target.value)} />
            </label>
            <label className="text-sm">
              <span>Đơn vị tính</span>
              <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={productUom} onChange={(event) => setProductUom(event.target.value)} />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Thành phần nguyên liệu trong công thức</p>
              <button
                type="button"
                onClick={handleAddRecipeItem}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs"
              >
                + Thêm nguyên liệu
              </button>
            </div>

            <div className="space-y-2">
              {recipeItems.map((item, index) => {
                const selectedMaterial = materialMap.get(item.materialId)
                return (
                  <div key={`${item.materialId}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-5">
                    <select
                      className="rounded-lg border border-slate-200 bg-white p-2 text-sm md:col-span-3"
                      value={item.materialId}
                      onChange={(event) => handleRecipeItemChange(index, 'materialId', event.target.value)}
                    >
                      {materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.code} - {material.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                      placeholder={`Khối lượng (${selectedMaterial?.uom ?? 'đv'})`}
                      value={item.qtyPerUnit}
                      onChange={(event) => handleRecipeItemChange(index, 'qtyPerUnit', event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipeItem(index)}
                      className="rounded-lg border border-rose-200 px-2 py-2 text-xs text-rose-600"
                    >
                      Xoá
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <button type="submit" disabled={!canManageRecipe || submitting || validationErrors.length > 0} className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? 'Đang lưu...' : 'Thêm công thức'}
          </button>
        </form>
        {validationErrors.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-rose-600">
            {validationErrors.map((error) => (
              <li key={error}>- {error}</li>
            ))}
          </ul>
        )}
        {!canManageRecipe && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
            Tài khoản hiện tại không có quyền recipe.manage để thêm công thức.
          </p>
        )}
        {feedback && <p className="mt-2 text-sm">{feedback}</p>}
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Danh sách công thức</h2>
        <ul className="space-y-2">
          {recipes.map((recipe) => (
            <li key={recipe.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-3 text-sm">
              <div>
                <p className="font-semibold">{recipe.name}</p>
                <p className="text-xs text-slate-500">Recipe ID: {recipe.id}</p>
              </div>
              <span className="status-pill bg-indigo-100 text-indigo-700">v{recipe.versionNo}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default RecipesPage
