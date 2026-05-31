'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  apiClient,
  getDefaultWarehouseId,
  type FinishedGoodStockRow,
  type MasterFinishedGood,
  type ProductionOrderRow
} from '../../lib/api'

const getStatusClassName = (status: string) => {
  if (status === 'COMPLETED') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (status === 'RELEASED' || status === 'IN_PROGRESS') {
    return 'bg-blue-100 text-blue-700'
  }

  return 'bg-amber-100 text-amber-700'
}

const FinishedGoodsPage = () => {
  const [orders, setOrders] = useState<ProductionOrderRow[]>([])
  const [finishedGoods, setFinishedGoods] = useState<MasterFinishedGood[]>([])
  const [finishedGoodStocks, setFinishedGoodStocks] = useState<FinishedGoodStockRow[]>([])
  const [orderNo, setOrderNo] = useState(`PO-${Date.now()}`)
  const [plannedQty, setPlannedQty] = useState('100')
  const [finishedGoodId, setFinishedGoodId] = useState('')
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false)
  const [showInventoryModal, setShowInventoryModal] = useState(false)
  const [inventoryQuantity, setInventoryQuantity] = useState('1')
  const [inventoryUnitCost, setInventoryUnitCost] = useState('0')
  const [inventoryReferenceNo, setInventoryReferenceNo] = useState(`FG-${Date.now()}`)
  const [actualQtyByOrderId, setActualQtyByOrderId] = useState<Record<string, string>>({})
  const [unitCostByOrderId, setUnitCostByOrderId] = useState<Record<string, string>>({})
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const activeFinishedGoods = useMemo(
    () => finishedGoods.filter((finishedGood) => finishedGood.isActive),
    [finishedGoods]
  )

  const loadData = async () => {
    const [ordersData, finishedGoodData, stockData] = await Promise.all([
      apiClient.getProductionOrders(),
      apiClient.getFinishedGoodsMaster(),
      apiClient.getFinishedGoodStocks()
    ])
    setOrders(ordersData)
    setFinishedGoods(finishedGoodData)
    setFinishedGoodStocks(stockData)
    if (finishedGoodData.length > 0) {
      const selectedStillActive = finishedGoodData.some((finishedGood) => finishedGood.id === finishedGoodId && finishedGood.isActive)
      if (!selectedStillActive) {
        const activeProduct = finishedGoodData.find((finishedGood) => finishedGood.isActive)
        setFinishedGoodId(activeProduct ? activeProduct.id : '')
      }
    }
  }

  useEffect(() => {
    loadData().catch((error) => {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải dữ liệu sản xuất')
    })
  }, [])

  const completedCount = useMemo(() => orders.filter((order) => order.status === 'COMPLETED').length, [orders])
  const approvedCount = useMemo(
    () => orders.filter((order) => order.status === 'RELEASED' || order.status === 'IN_PROGRESS').length,
    [orders]
  )
  const pendingApprovalCount = useMemo(() => orders.filter((order) => order.status === 'DRAFT').length, [orders])
  const totalStockQty = useMemo(
    () => finishedGoodStocks.reduce((sum, stock) => sum + stock.quantityOnHand, 0),
    [finishedGoodStocks]
  )
  const selectedStockQty = useMemo(() => {
    const current = finishedGoodStocks.find((stock) => stock.finishedGoodId === finishedGoodId)
    return current?.quantityOnHand ?? 0
  }, [finishedGoodId, finishedGoodStocks])

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      await apiClient.createProductionOrder({
        warehouseId: getDefaultWarehouseId(),
        orderNo,
        finishedGoodId,
        plannedQty: Number(plannedQty)
      })
      setOrderNo(`PO-${Date.now()}`)
      setPlannedQty('100')
      setShowCreateOrderModal(false)
      await loadData()
      setFeedback('Đã tạo lệnh sản xuất thành công')
    } catch (createError) {
      setFeedback(createError instanceof Error ? createError.message : 'Không thể tạo lệnh sản xuất')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApproveOrder = async (orderId: string) => {
    setProcessingOrderId(orderId)
    setFeedback(null)
    try {
      await apiClient.approveProductionOrder(orderId)
      await loadData()
      setFeedback('Đã duyệt lệnh sản xuất')
    } catch (approveError) {
      setFeedback(approveError instanceof Error ? approveError.message : 'Không thể duyệt lệnh sản xuất')
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleCompleteOrder = async (orderId: string) => {
    const actualQty = Number(actualQtyByOrderId[orderId] ?? '')
    const outputUnitCost = Number(unitCostByOrderId[orderId] ?? '')

    if (actualQty <= 0) {
      setFeedback('Sản lượng thực tế phải lớn hơn 0')
      return
    }

    if (outputUnitCost < 0) {
      setFeedback('Đơn giá thành phẩm không được âm')
      return
    }

    setProcessingOrderId(orderId)
    setFeedback(null)
    try {
      await apiClient.completeProductionOrder({
        orderId,
        actualQty,
        outputUnitCost,
        movedAt: new Date().toISOString()
      })
      await loadData()
      setFeedback('Đã hoàn thành lệnh: NVL đã trừ và tồn kho thành phẩm đã tăng')
    } catch (completeError) {
      setFeedback(completeError instanceof Error ? completeError.message : 'Không thể hoàn thành lệnh sản xuất')
    } finally {
      setProcessingOrderId(null)
    }
  }

  const handleOpenInventoryModal = () => {
    setInventoryQuantity('1')
    setInventoryUnitCost('0')
    setInventoryReferenceNo(`FG-${Date.now()}`)
    setFeedback(null)
    setShowInventoryModal(true)
  }

  const handleCloseInventoryModal = () => {
    setShowInventoryModal(false)
  }

  const handleOpenCreateOrderModal = () => {
    setFeedback(null)
    setShowCreateOrderModal(true)
  }

  const handleCloseCreateOrderModal = () => {
    setShowCreateOrderModal(false)
  }

  const handleSubmitInventoryAction = async (event: React.FormEvent) => {
    event.preventDefault()
    const qty = Number(inventoryQuantity)
    const unitCost = Number(inventoryUnitCost)

    if (!finishedGoodId) {
      setFeedback('Vui lòng chọn sản phẩm thành phẩm')
      return
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      setFeedback('Số lượng thành phẩm phải lớn hơn 0')
      return
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setFeedback('Đơn giá không hợp lệ')
      return
    }

    if (qty > selectedStockQty) {
      setFeedback(`Tồn kho không đủ để xuất. Hiện có ${selectedStockQty}`)
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const payload = {
        warehouseId: getDefaultWarehouseId(),
        finishedGoodId,
        quantity: qty,
        unitCost,
        movedAt: new Date().toISOString(),
        referenceId: crypto.randomUUID(),
        referenceType: `FG_MANUAL_ISSUE_${inventoryReferenceNo}`
      }
      await apiClient.createFinishedGoodIssue(payload)
      await loadData()
      setShowInventoryModal(false)
      setFeedback('Đã xuất kho thành phẩm thành công')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật tồn kho thành phẩm')
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
            Luồng lệnh sản xuất: Chờ xét duyệt → Đã duyệt → Hoàn thành. Chỉ khi hoàn thành mới trừ NVL theo sản lượng thực tế.
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
          <p className="text-xs uppercase text-slate-500">Đã duyệt</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{approvedCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase text-slate-500">Chờ xét duyệt</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{pendingApprovalCount}</p>
        </article>
      </section>

      <section className="surface-card p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Quản lý tồn kho thành phẩm</h2>
            <p className="text-sm text-slate-500">Tồn thành phẩm chỉ tăng tự động sau khi lệnh sản xuất hoàn thành theo sản lượng thực tế</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleOpenInventoryModal} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white">
              Xuất kho thành phẩm
            </button>
          </div>
        </div>

        <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
          Tổng tồn thành phẩm hiện tại: <span className="font-semibold">{totalStockQty}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Mã TP</th>
                <th className="px-3 py-2">Tên TP</th>
                <th className="px-3 py-2">ĐVT</th>
                <th className="px-3 py-2 text-right">Tồn hiện tại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {finishedGoodStocks.map((stock) => (
                <tr key={stock.finishedGoodId} className="bg-white">
                  <td className="px-3 py-3 font-medium">{stock.code}</td>
                  <td className="px-3 py-3">{stock.name}</td>
                  <td className="px-3 py-3">{stock.uom}</td>
                  <td className="px-3 py-3 text-right font-semibold">{stock.quantityOnHand}</td>
                </tr>
              ))}
              {finishedGoodStocks.length === 0 && (
                <tr className="bg-white">
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                    Chưa có tồn kho thành phẩm
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Tạo lệnh sản xuất</h2>
          <button type="button" onClick={handleOpenCreateOrderModal} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            + Tạo lệnh sản xuất
          </button>
        </div>
        {activeFinishedGoods.length === 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
            Không có sản phẩm đang hoạt động để tạo lệnh sản xuất.
          </p>
        )}
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
                  <p className="text-sm text-slate-600">Sản phẩm ID: {order.finishedGoodId}</p>
                </div>
                <span className={`status-pill w-fit ${getStatusClassName(order.status)}`}>
                  {order.statusLabel}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <p className="rounded-lg bg-slate-50 p-2 text-center">Kế hoạch: {order.plannedQty}</p>
                <p className="rounded-lg bg-slate-50 p-2 text-center">Thực tế: {order.actualQty}</p>
                <p className="rounded-lg bg-slate-50 p-2 text-center">Kho: {order.warehouseId.slice(0, 8)}...</p>
                <p className="rounded-lg bg-slate-50 p-2 text-center">Tạo lúc: {new Date(order.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              {order.status === 'DRAFT' && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => handleApproveOrder(order.id)}
                    disabled={processingOrderId === order.id}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {processingOrderId === order.id ? 'Đang duyệt...' : 'Duyệt lệnh'}
                  </button>
                </div>
              )}
              {(order.status === 'RELEASED' || order.status === 'IN_PROGRESS') && (
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                  <input
                    placeholder="SL thực tế"
                    value={actualQtyByOrderId[order.id] ?? ''}
                    onChange={(event) => setActualQtyByOrderId((previous) => ({ ...previous, [order.id]: event.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  />
                  <input
                    placeholder="Đơn giá TP"
                    value={unitCostByOrderId[order.id] ?? ''}
                    onChange={(event) => setUnitCostByOrderId((previous) => ({ ...previous, [order.id]: event.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleCompleteOrder(order.id)}
                    disabled={processingOrderId === order.id}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {processingOrderId === order.id ? 'Đang hoàn thành...' : 'Hoàn thành'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {showCreateOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Tạo lệnh sản xuất">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Tạo lệnh sản xuất</h2>
              <button type="button" onClick={handleCloseCreateOrderModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                Đóng
              </button>
            </div>
            <form onSubmit={handleCreateOrder} className="grid grid-cols-1 gap-3">
              <label className="text-sm">
                <span>Mã lệnh</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={orderNo} onChange={(event) => setOrderNo(event.target.value)} />
              </label>
              <label className="text-sm">
                <span>Sản phẩm</span>
                <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={finishedGoodId} onChange={(event) => setFinishedGoodId(event.target.value)}>
                  {activeFinishedGoods.map((finishedGood) => (
                    <option key={finishedGood.id} value={finishedGood.id}>
                      {finishedGood.code} - {finishedGood.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span>Sản lượng kế hoạch</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={plannedQty} onChange={(event) => setPlannedQty(event.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={submitting || !activeFinishedGoods.some((finishedGood) => finishedGood.id === finishedGoodId)} className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {submitting ? 'Đang tạo...' : 'Tạo lệnh'}
                </button>
                <button type="button" onClick={handleCloseCreateOrderModal} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                  Huỷ
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showInventoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Cập nhật tồn kho thành phẩm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Xuất kho thành phẩm</h2>
              <button type="button" onClick={handleCloseInventoryModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                Đóng
              </button>
            </div>
            <form onSubmit={handleSubmitInventoryAction} className="grid grid-cols-1 gap-3">
              <label className="text-sm">
                <span>Sản phẩm</span>
                <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={finishedGoodId} onChange={(event) => setFinishedGoodId(event.target.value)}>
                  {activeFinishedGoods.map((finishedGood) => (
                    <option key={finishedGood.id} value={finishedGood.id}>
                      {finishedGood.code} - {finishedGood.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span>Số lượng</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={inventoryQuantity} onChange={(event) => setInventoryQuantity(event.target.value)} />
              </label>
              <label className="text-sm">
                <span>Đơn giá</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={inventoryUnitCost} onChange={(event) => setInventoryUnitCost(event.target.value)} />
              </label>
              <label className="text-sm">
                <span>Mã tham chiếu</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={inventoryReferenceNo} onChange={(event) => setInventoryReferenceNo(event.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {submitting ? 'Đang xử lý...' : 'Xác nhận xuất'}
                </button>
                <button type="button" onClick={handleCloseInventoryModal} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                  Huỷ
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Tồn khả dụng của sản phẩm đang chọn: {selectedStockQty}
              </p>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default FinishedGoodsPage
