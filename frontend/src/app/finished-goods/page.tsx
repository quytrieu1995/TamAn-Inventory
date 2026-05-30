'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  apiClient,
  getDefaultWarehouseId,
  type MasterFinishedGood,
  type MasterRecipe,
  type ProductionOrderRow
} from '../../lib/api'

const getStatusLabel = (status: string) => {
  if (status === 'COMPLETED') {
    return 'Hoàn thành'
  }

  if (status === 'IN_PROGRESS') {
    return 'Đang chạy'
  }

  return 'Sẵn sàng'
}

const getStatusClassName = (status: string) => {
  if (status === 'COMPLETED') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (status === 'IN_PROGRESS') {
    return 'bg-blue-100 text-blue-700'
  }

  return 'bg-amber-100 text-amber-700'
}

const FinishedGoodsPage = () => {
  const [orders, setOrders] = useState<ProductionOrderRow[]>([])
  const [finishedGoods, setFinishedGoods] = useState<MasterFinishedGood[]>([])
  const [recipes, setRecipes] = useState<MasterRecipe[]>([])
  const [orderNo, setOrderNo] = useState(`PO-${Date.now()}`)
  const [plannedQty, setPlannedQty] = useState('100')
  const [finishedGoodId, setFinishedGoodId] = useState('')
  const [recipeId, setRecipeId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    const [ordersData, finishedGoodData, recipeData] = await Promise.all([
      apiClient.getProductionOrders(),
      apiClient.getFinishedGoodsMaster(),
      apiClient.getRecipesMaster()
    ])
    setOrders(ordersData)
    setFinishedGoods(finishedGoodData)
    setRecipes(recipeData)
    if (!finishedGoodId && finishedGoodData.length > 0) {
      setFinishedGoodId(finishedGoodData[0].id)
    }
    if (!recipeId && recipeData.length > 0) {
      setRecipeId(recipeData[0].id)
    }
  }

  useEffect(() => {
    loadData().catch((error) => {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải dữ liệu sản xuất')
    })
  }, [])

  const completedCount = useMemo(() => orders.filter((order) => order.status === 'COMPLETED').length, [orders])
  const inProgressCount = useMemo(() => orders.filter((order) => order.status === 'IN_PROGRESS' || order.status === 'RELEASED').length, [orders])

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      await apiClient.createProductionOrder({
        warehouseId: getDefaultWarehouseId(),
        orderNo,
        finishedGoodId,
        recipeId,
        plannedQty: Number(plannedQty)
      })
      setOrderNo(`PO-${Date.now()}`)
      setPlannedQty('100')
      await loadData()
      setFeedback('Đã tạo lệnh sản xuất thành công')
    } catch (createError) {
      setFeedback(createError instanceof Error ? createError.message : 'Không thể tạo lệnh sản xuất')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold md:text-3xl">Thành phẩm và sản xuất</h1>
          <p className="muted-text text-sm md:text-base">
            Theo dõi lệnh sản xuất, xuất NVL theo BOM và kết quả nhập kho thành phẩm.
          </p>
        </div>
        <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">Tạo lệnh sản xuất trực tiếp từ giao diện</span>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="surface-card p-4">
          <p className="text-xs uppercase text-slate-500">Lệnh hoàn thành</p>
          <p className="mt-1 text-2xl font-semibold">{completedCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase text-slate-500">Lệnh đang chạy</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{inProgressCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase text-slate-500">Tổng lệnh</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{orders.length}</p>
        </article>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Tạo lệnh sản xuất</h2>
        <form onSubmit={handleCreateOrder} className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span>Mã lệnh</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={orderNo} onChange={(event) => setOrderNo(event.target.value)} />
          </label>
          <label className="text-sm">
            <span>Sản phẩm</span>
            <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={finishedGoodId} onChange={(event) => setFinishedGoodId(event.target.value)}>
              {finishedGoods.map((finishedGood) => (
                <option key={finishedGood.id} value={finishedGood.id}>
                  {finishedGood.code} - {finishedGood.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span>Công thức</span>
            <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name} - v{recipe.versionNo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span>Sản lượng kế hoạch</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={plannedQty} onChange={(event) => setPlannedQty(event.target.value)} />
          </label>
          <button type="submit" disabled={submitting} className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? 'Đang tạo...' : 'Tạo lệnh'}
          </button>
        </form>
        {feedback && <p className="mb-3 text-sm">{feedback}</p>}

        <ul className="space-y-3">
          {orders.map((order) => (
            <li
              key={order.orderNo}
              tabIndex={0}
              aria-label={`Lệnh ${order.orderNo}`}
              className="rounded-xl border border-slate-100 bg-white p-3"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{order.orderNo}</p>
                  <p className="text-sm text-slate-600">Recipe ID: {order.recipeId}</p>
                </div>
                <span className={`status-pill w-fit ${getStatusClassName(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <p className="rounded-lg bg-slate-50 p-2 text-center">Kế hoạch: {order.plannedQty}</p>
                <p className="rounded-lg bg-slate-50 p-2 text-center">Thực tế: {order.actualQty}</p>
                <p className="rounded-lg bg-slate-50 p-2 text-center">Kho: {order.warehouseId.slice(0, 8)}...</p>
                <p className="rounded-lg bg-slate-50 p-2 text-center">Tạo lúc: {new Date(order.createdAt).toLocaleString('vi-VN')}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default FinishedGoodsPage
