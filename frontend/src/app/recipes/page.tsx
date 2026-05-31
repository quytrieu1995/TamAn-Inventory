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

type ProductStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type FinishedGoodUom = 'lon' | 'chai' | 'goi'

const FINISHED_GOOD_UOM_OPTIONS: Array<{ value: FinishedGoodUom, label: string }> = [
  { value: 'lon', label: 'Lon' },
  { value: 'chai', label: 'Chai' },
  { value: 'goi', label: 'Gói' }
]

const RecipesPage = () => {
  const { session } = useSession()
  const [materials, setMaterials] = useState<MasterMaterial[]>([])
  const [recipes, setRecipes] = useState<MasterRecipe[]>([])
  const [productCode, setProductCode] = useState('')
  const [productName, setProductName] = useState('')
  const [productUom, setProductUom] = useState<FinishedGoodUom>('goi')
  const [productUnitPrice, setProductUnitPrice] = useState('0')
  const [recipeItems, setRecipeItems] = useState<RecipeItemDraft[]>([])
  const [showCreateProductModal, setShowCreateProductModal] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('ALL')
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [editingRecipeName, setEditingRecipeName] = useState('')
  const [editingProductName, setEditingProductName] = useState('')
  const [editingProductUom, setEditingProductUom] = useState<FinishedGoodUom>('goi')
  const [editingProductUnitPrice, setEditingProductUnitPrice] = useState('0')
  const [editingRecipeItems, setEditingRecipeItems] = useState<RecipeItemDraft[]>([])
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null)
  const [detailRecipeItems, setDetailRecipeItems] = useState<RecipeItemDraft[]>([])
  const [loadingRecipeDetail, setLoadingRecipeDetail] = useState(false)
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
      const activeMaterial = materialData.find((material) => material.isActive)
      if (!activeMaterial) {
        setRecipeItems([])
        return
      }
      setRecipeItems([
        {
          materialId: activeMaterial.id,
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
      setFeedback(error instanceof Error ? error.message : 'Không thể tải dữ liệu sản phẩm/BOM')
    })
  }, [canViewRecipe])

  const materialMap = useMemo(() => {
    return new Map(materials.map((material) => [material.id, material]))
  }, [materials])
  const activeMaterials = useMemo(() => materials.filter((material) => material.isActive), [materials])
  const hasActiveMaterials = activeMaterials.length > 0

  const buildValidationErrors = (items: RecipeItemDraft[]) => {
    const errors: string[] = []

    const materialIds = items.map((item) => item.materialId)
    const uniqueMaterialIds = new Set(materialIds)
    if (uniqueMaterialIds.size !== materialIds.length) {
      errors.push('Không được chọn trùng nguyên liệu trong cùng một công thức')
    }

    const quantities = items.map((item) => Number(item.qtyPerUnit))
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
  }

  const validationErrors = useMemo(() => {
    return buildValidationErrors(recipeItems)
  }, [recipeItems])

  const editingValidationErrors = useMemo(() => {
    return buildValidationErrors(editingRecipeItems)
  }, [editingRecipeItems])

  const filteredRecipes = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    return recipes.filter((recipe) => {
      const matchKeyword = !keyword
        || recipe.productCode.toLowerCase().includes(keyword)
        || recipe.productName.toLowerCase().includes(keyword)

      const matchStatus = statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' && recipe.productIsActive)
        || (statusFilter === 'INACTIVE' && !recipe.productIsActive)

      return matchKeyword && matchStatus
    })
  }, [recipes, searchKeyword, statusFilter])

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
    if (activeMaterials.length === 0) {
      return
    }

    setRecipeItems((previous) => [
      ...previous,
      {
        materialId: activeMaterials[0].id,
        qtyPerUnit: '0.1'
      }
    ])
  }

  const handleEditingRecipeItemChange = (index: number, field: keyof RecipeItemDraft, value: string) => {
    setEditingRecipeItems((previous) => {
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

  const handleAddEditingRecipeItem = () => {
    if (activeMaterials.length === 0) {
      return
    }

    setEditingRecipeItems((previous) => [
      ...previous,
      {
        materialId: activeMaterials[0].id,
        qtyPerUnit: '0.1'
      }
    ])
  }

  const handleRemoveEditingRecipeItem = (index: number) => {
    setEditingRecipeItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleRemoveRecipeItem = (index: number) => {
    setRecipeItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleCreateRecipe = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManageRecipe) {
      setFeedback('Bạn không có quyền thêm sản phẩm/BOM')
      return
    }
    if (!productCode.trim() || !productName.trim()) {
      setFeedback('Vui lòng nhập đầy đủ mã sản phẩm, tên sản phẩm, đơn vị tính và đơn giá')
      return
    }
    const parsedUnitPrice = Number(productUnitPrice)
    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
      setFeedback('Đơn giá sản phẩm phải là số không âm')
      return
    }
    if (recipeItems.length === 0) {
      setFeedback('BOM cần ít nhất một nguyên liệu')
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
        name: `${productCode.trim()} - ${productName.trim()}`,
        product: {
          code: productCode.trim(),
          name: productName.trim(),
          uom: productUom.trim(),
          unitPrice: parsedUnitPrice
        },
        items: recipeItems.map((item) => ({
          materialId: item.materialId,
          qtyPerUnit: Number(item.qtyPerUnit)
        }))
      })
      setProductCode('')
      setProductName('')
      setProductUom('goi')
      setProductUnitPrice('0')
      if (activeMaterials.length > 0) {
        setRecipeItems([
          {
            materialId: activeMaterials[0].id,
            qtyPerUnit: '0.1'
          }
        ])
      } else {
        setRecipeItems([])
      }
      await loadData()
      setShowCreateProductModal(false)
      setFeedback('Đã thêm sản phẩm và BOM thành công')
    } catch (createError) {
      setFeedback(createError instanceof Error ? createError.message : 'Không thể thêm sản phẩm/BOM')
    } finally {
      setSubmitting(false)
    }
  }

  const resetCreateProductForm = () => {
    setProductCode('')
    setProductName('')
    setProductUom('goi')
    setProductUnitPrice('0')
    if (activeMaterials.length > 0) {
      setRecipeItems([
        {
          materialId: activeMaterials[0].id,
          qtyPerUnit: '0.1'
        }
      ])
    } else {
      setRecipeItems([])
    }
  }

  const handleOpenCreateProductModal = () => {
    setFeedback(null)
    setShowCreateProductModal(true)
  }

  const handleCloseCreateProductModal = () => {
    setShowCreateProductModal(false)
    resetCreateProductForm()
  }

  const handleStartEditRecipe = async (recipeId: string) => {
    setFeedback(null)
    setLoadingRecipeDetail(true)
    try {
      const detail = await apiClient.getRecipeById(recipeId)
      const recipeSummary = recipes.find((recipe) => recipe.id === recipeId)
      setEditingRecipeId(detail.id)
      setEditingRecipeName(detail.name)
      setEditingProductName(recipeSummary?.productName ?? '')
      if (recipeSummary?.productUom === 'lon' || recipeSummary?.productUom === 'chai' || recipeSummary?.productUom === 'goi') {
        setEditingProductUom(recipeSummary.productUom)
      } else {
        setEditingProductUom('goi')
      }
      setEditingProductUnitPrice(String(recipeSummary?.productUnitPrice ?? 0))
      setEditingRecipeItems(detail.items.map((item) => ({
        materialId: item.materialId,
        qtyPerUnit: String(item.qtyPerUnit)
      })))
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải chi tiết BOM')
    } finally {
      setLoadingRecipeDetail(false)
    }
  }

  const handleViewRecipeDetail = async (recipeId: string) => {
    setFeedback(null)
    setLoadingRecipeDetail(true)
    try {
      const detail = await apiClient.getRecipeById(recipeId)
      setDetailRecipeId(detail.id)
      setDetailRecipeItems(detail.items.map((item) => ({
        materialId: item.materialId,
        qtyPerUnit: String(item.qtyPerUnit)
      })))
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải chi tiết BOM')
    } finally {
      setLoadingRecipeDetail(false)
    }
  }

  const handleCancelEditRecipe = () => {
    setEditingRecipeId(null)
    setEditingRecipeName('')
    setEditingProductName('')
    setEditingProductUom('goi')
    setEditingProductUnitPrice('0')
    setEditingRecipeItems([])
  }

  const handleUpdateRecipe = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingRecipeId) {
      return
    }
    if (!canManageRecipe) {
      setFeedback('Bạn không có quyền sửa BOM')
      return
    }
    if (editingRecipeItems.length === 0) {
      setFeedback('BOM cần ít nhất một nguyên liệu')
      return
    }
    if (editingValidationErrors.length > 0) {
      setFeedback(editingValidationErrors[0])
      return
    }
    if (!editingProductName.trim()) {
      setFeedback('Vui lòng nhập tên sản phẩm')
      return
    }
    const parsedEditingUnitPrice = Number(editingProductUnitPrice)
    if (!Number.isFinite(parsedEditingUnitPrice) || parsedEditingUnitPrice < 0) {
      setFeedback('Đơn giá sản phẩm phải là số không âm')
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      await apiClient.updateRecipe(editingRecipeId, {
        name: editingRecipeName.trim() || 'BOM sản phẩm',
        productName: editingProductName.trim(),
        productUom: editingProductUom,
        productUnitPrice: parsedEditingUnitPrice,
        items: editingRecipeItems.map((item) => ({
          materialId: item.materialId,
          qtyPerUnit: Number(item.qtyPerUnit)
        }))
      })
      await loadData()
      setFeedback('Đã cập nhật BOM thành công')
      handleCancelEditRecipe()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật BOM')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteProduct = async (finishedGoodId: string) => {
    if (!canManageRecipe) {
      setFeedback('Bạn không có quyền xoá sản phẩm')
      return
    }

    const confirmed = window.confirm('Bạn có chắc chắn muốn xoá sản phẩm này?')
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      await apiClient.deleteFinishedGood(finishedGoodId)
      await loadData()
      if (detailRecipeId) {
        setDetailRecipeId(null)
        setDetailRecipeItems([])
      }
      if (editingRecipeId) {
        handleCancelEditRecipe()
      }
      setFeedback('Đã xoá sản phẩm thành công')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể xoá sản phẩm')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleProductStatus = async (finishedGoodId: string, isActive: boolean) => {
    if (!canManageRecipe) {
      setFeedback('Bạn không có quyền đổi trạng thái sản phẩm')
      return
    }

    try {
      await apiClient.updateFinishedGoodStatus(finishedGoodId, !isActive)
      setRecipes((previous) => previous.map((recipe) => {
        if (recipe.finishedGoodId !== finishedGoodId) {
          return recipe
        }
        return {
          ...recipe,
          productIsActive: !isActive
        }
      }))
      setFeedback(!isActive ? 'Đã kích hoạt sản phẩm' : 'Đã chuyển sản phẩm sang ngừng hoạt động')
      await loadData()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái sản phẩm')
    }
  }

  if (!canViewRecipe) {
    return (
      <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Bạn không có quyền xem sản phẩm/BOM
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold md:text-3xl">Sản phẩm và BOM</h1>
          <p className="muted-text text-sm md:text-base">
            Quản lý sản phẩm và định mức nguyên liệu (BOM) cho sản xuất.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreateProductModal}
          disabled={!canManageRecipe}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          + Thêm sản phẩm
        </button>
      </header>

      {feedback && <p className="text-sm">{feedback}</p>}

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Danh sách sản phẩm</h2>
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
            placeholder="Tìm theo mã sản phẩm hoặc tên sản phẩm..."
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStatusFilter('ALL')} className={`rounded-lg px-3 py-1 text-xs ${statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>Tất cả</button>
            <button type="button" onClick={() => setStatusFilter('ACTIVE')} className={`rounded-lg px-3 py-1 text-xs ${statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>Hoạt động</button>
            <button type="button" onClick={() => setStatusFilter('INACTIVE')} className={`rounded-lg px-3 py-1 text-xs ${statusFilter === 'INACTIVE' ? 'bg-rose-600 text-white' : 'bg-slate-100'}`}>Ngừng hoạt động</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2">BOM ID</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2 text-right">Đơn giá</th>
                <th className="px-3 py-2">Phiên bản</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecipes.map((recipe) => (
                <tr key={recipe.id} className={`bg-white ${recipe.productIsActive ? '' : 'opacity-70'}`}>
                  <td className="px-3 py-3">
                    <p>{recipe.productCode} - {recipe.productName}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-xs text-slate-500">{recipe.id}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`status-pill ${recipe.productIsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {recipe.productIsActive ? 'Hoạt động' : 'Ngừng hoạt động'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">{recipe.productUnitPrice}</td>
                  <td className="px-3 py-3">
                    <span className="status-pill bg-indigo-100 text-indigo-700">v{recipe.versionNo}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewRecipeDetail(recipe.id)}
                        disabled={loadingRecipeDetail}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs disabled:opacity-50"
                      >
                        Xem chi tiết BOM
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEditRecipe(recipe.id)}
                        disabled={!canManageRecipe || loadingRecipeDetail}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs disabled:opacity-50"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(recipe.finishedGoodId)}
                        disabled={!canManageRecipe || submitting}
                        className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-600 disabled:opacity-50"
                      >
                        Xoá sản phẩm
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleProductStatus(recipe.finishedGoodId, recipe.productIsActive)}
                        disabled={!canManageRecipe}
                        className="rounded-lg border border-blue-200 px-3 py-1 text-xs text-blue-600 disabled:opacity-50"
                      >
                        {recipe.productIsActive ? 'Ngừng hoạt động' : 'Kích hoạt'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRecipes.length === 0 && (
                <tr className="bg-white">
                  <td colSpan={6} className="px-3 py-4 text-center text-sm text-slate-500">
                    Không tìm thấy sản phẩm phù hợp
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailRecipeId && (
        <section className="surface-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Chi tiết BOM sản phẩm</h2>
            <button
              type="button"
              onClick={() => {
                setDetailRecipeId(null)
                setDetailRecipeItems([])
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs"
            >
              Đóng
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">BOM ID: {detailRecipeId}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nguyên liệu</th>
                  <th className="px-3 py-2">Khối lượng</th>
                  <th className="px-3 py-2">Đơn vị tính NVL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailRecipeItems.map((item, index) => {
                  const material = materialMap.get(item.materialId)
                  return (
                    <tr key={`${detailRecipeId}-${item.materialId}-${index}`} className="bg-white">
                      <td className="px-3 py-3">
                        {material ? `${material.code} - ${material.name}` : item.materialId}
                      </td>
                      <td className="px-3 py-3">{item.qtyPerUnit}</td>
                      <td className="px-3 py-3">{material?.uom ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editingRecipeId && (
        <section className="surface-card p-4">
          <h2 className="mb-3 text-base font-semibold">Chỉnh sửa BOM sản phẩm</h2>
          <form onSubmit={handleUpdateRecipe} className="grid grid-cols-1 gap-3">
            <label className="text-sm">
              <span>Tên sản phẩm</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                value={editingProductName}
                onChange={(event) => setEditingProductName(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span>Đơn vị tính sản phẩm</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                value={editingProductUom}
                onChange={(event) => setEditingProductUom(event.target.value as FinishedGoodUom)}
              >
                {FINISHED_GOOD_UOM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span>Đơn giá sản phẩm</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                value={editingProductUnitPrice}
                onChange={(event) => setEditingProductUnitPrice(event.target.value)}
              />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Thành phần nguyên liệu</p>
                <button
                  type="button"
                  onClick={handleAddEditingRecipeItem}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs"
                >
                  + Thêm nguyên liệu
                </button>
              </div>

              <div className="space-y-2">
                {editingRecipeItems.map((item, index) => {
                  const selectedMaterial = materialMap.get(item.materialId)
                  return (
                    <div key={`${editingRecipeId}-${item.materialId}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-6">
                      <select
                        className="rounded-lg border border-slate-200 bg-white p-2 text-sm md:col-span-2"
                        value={item.materialId}
                        onChange={(event) => handleEditingRecipeItemChange(index, 'materialId', event.target.value)}
                      >
                        {activeMaterials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.code} - {material.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                        placeholder={`Khối lượng (${selectedMaterial?.uom ?? 'đv'})`}
                        value={item.qtyPerUnit}
                        onChange={(event) => handleEditingRecipeItemChange(index, 'qtyPerUnit', event.target.value)}
                      />
                      <input
                        className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-sm"
                        value={selectedMaterial?.uom ?? '-'}
                        readOnly
                        aria-label="Đơn vị tính NVL"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveEditingRecipeItem(index)}
                        className="rounded-lg border border-rose-200 px-2 py-2 text-xs text-rose-600"
                      >
                        Xoá
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={!canManageRecipe || submitting || editingValidationErrors.length > 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {submitting ? 'Đang lưu...' : 'Lưu cập nhật'}
              </button>
              <button type="button" onClick={handleCancelEditRecipe} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                Huỷ
              </button>
            </div>
          </form>
          {editingValidationErrors.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-rose-600">
              {editingValidationErrors.map((error) => (
                <li key={`edit-${error}`}>- {error}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showCreateProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Thêm sản phẩm mới">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Thêm sản phẩm mới và BOM</h2>
              <button type="button" onClick={handleCloseCreateProductModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                Đóng
              </button>
            </div>
            <form onSubmit={handleCreateRecipe} className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                    value={productUom}
                    onChange={(event) => setProductUom(event.target.value as FinishedGoodUom)}
                  >
                    {FINISHED_GOOD_UOM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span>Đơn giá sản phẩm</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                    value={productUnitPrice}
                    onChange={(event) => setProductUnitPrice(event.target.value)}
                  />
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Thành phần nguyên liệu trong BOM</p>
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
                      <div key={`${item.materialId}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-6">
                        <select
                          className="rounded-lg border border-slate-200 bg-white p-2 text-sm md:col-span-2"
                          value={item.materialId}
                          onChange={(event) => handleRecipeItemChange(index, 'materialId', event.target.value)}
                        >
                          {activeMaterials.map((material) => (
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
                        <input
                          className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-sm"
                          value={selectedMaterial?.uom ?? '-'}
                          readOnly
                          aria-label="Đơn vị tính NVL"
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

              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={!canManageRecipe || !hasActiveMaterials || submitting || validationErrors.length > 0} className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {submitting ? 'Đang lưu...' : 'Thêm sản phẩm'}
                </button>
                <button type="button" onClick={handleCloseCreateProductModal} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                  Huỷ
                </button>
              </div>
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
                Tài khoản hiện tại không có quyền recipe.manage để thêm sản phẩm/BOM.
              </p>
            )}
            {!hasActiveMaterials && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
                Không có nguyên liệu đang hoạt động để cấu hình BOM.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default RecipesPage
