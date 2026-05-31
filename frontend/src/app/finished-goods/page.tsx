'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  apiClient,
  getDefaultWarehouseId,
  type FinishedGoodIssueRow,
  type FinishedGoodStockRow,
  type MasterFinishedGood,
  type ProductionOrderRow
} from '../../lib/api'
import { useSession } from '../../hooks/use-session'

type CreateOrderLine = {
  id: string
  finishedGoodId: string
  plannedQty: string
}

type IssueLine = {
  id: string
  finishedGoodId: string
  quantity: string
  unitCost: string
}

type FinishedGoodsView = 'INVENTORY' | 'ORDERS' | 'ISSUES'

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
  const searchParams = useSearchParams()
  const { session } = useSession()
  const [orders, setOrders] = useState<ProductionOrderRow[]>([])
  const [finishedGoods, setFinishedGoods] = useState<MasterFinishedGood[]>([])
  const [finishedGoodStocks, setFinishedGoodStocks] = useState<FinishedGoodStockRow[]>([])
  const [issueRows, setIssueRows] = useState<FinishedGoodIssueRow[]>([])
  const [orderBatchNo, setOrderBatchNo] = useState(`PO-${Date.now()}`)
  const [createOrderLines, setCreateOrderLines] = useState<CreateOrderLine[]>([])
  const [issueLines, setIssueLines] = useState<IssueLine[]>([])
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false)
  const [showInventoryModal, setShowInventoryModal] = useState(false)
  const [cancelingIssue, setCancelingIssue] = useState<FinishedGoodIssueRow | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [inventoryReferenceNo, setInventoryReferenceNo] = useState(`FG-${Date.now()}`)
  const [actualQtyByOrderId, setActualQtyByOrderId] = useState<Record<string, string>>({})
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const canApproveProduction = session?.permissions.includes('production.approve') || session?.permissions.includes('production.create')
  const canCancelIssue = session?.permissions.includes('inventory.cancel')
    || session?.permissions.includes('inventory.issue')
    || session?.permissions.includes('inventory.adjust')
    || false
  const activeFinishedGoods = useMemo(
    () => finishedGoods.filter((finishedGood) => finishedGood.isActive),
    [finishedGoods]
  )

  const loadData = async () => {
    const [ordersData, finishedGoodData, stockData, issueData] = await Promise.all([
      apiClient.getProductionOrders(),
      apiClient.getFinishedGoodsMaster(),
      apiClient.getFinishedGoodStocks(),
      apiClient.getFinishedGoodIssues()
    ])
    setOrders(ordersData)
    setFinishedGoods(finishedGoodData)
    setFinishedGoodStocks(stockData)
    setIssueRows(issueData)
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
  const finishedGoodMap = useMemo(() => {
    return new Map(finishedGoods.map((item) => [item.id, item]))
  }, [finishedGoods])
  const finishedGoodStockMap = useMemo(() => {
    return new Map(finishedGoodStocks.map((item) => [item.finishedGoodId, item.quantityOnHand]))
  }, [finishedGoodStocks])

  const currentView: FinishedGoodsView = useMemo(() => {
    const view = searchParams.get('view')
    if (view === 'orders') {
      return 'ORDERS'
    }
    if (view === 'issues') {
      return 'ISSUES'
    }
    return 'INVENTORY'
  }, [searchParams])

  const buildDefaultCreateLine = () => {
    const firstActiveProduct = activeFinishedGoods[0]
    return {
      id: crypto.randomUUID(),
      finishedGoodId: firstActiveProduct?.id ?? '',
      plannedQty: '100'
    }
  }

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!orderBatchNo.trim()) {
      setFeedback('Vui lòng nhập mã batch lệnh sản xuất')
      return
    }

    if (createOrderLines.length === 0) {
      setFeedback('Vui lòng thêm ít nhất một sản phẩm để tạo lệnh')
      return
    }

    const invalidLine = createOrderLines.find((line) => {
      const plannedValue = Number(line.plannedQty)
      return !line.finishedGoodId || !Number.isFinite(plannedValue) || plannedValue <= 0
    })

    if (invalidLine) {
      setFeedback('Mỗi dòng sản phẩm cần chọn sản phẩm và nhập sản lượng lớn hơn 0')
      return
    }

    setSubmitting(true)
    setFeedback(null)

    let successCount = 0
    const failedMessages: string[] = []

    try {
      for (const [index, line] of createOrderLines.entries()) {
        const orderNo = `${orderBatchNo.trim()}-${String(index + 1).padStart(2, '0')}`
        try {
          await apiClient.createProductionOrder({
            warehouseId: getDefaultWarehouseId(),
            orderNo,
            finishedGoodId: line.finishedGoodId,
            plannedQty: Number(line.plannedQty)
          })
          successCount += 1
        } catch (lineError) {
          const message = lineError instanceof Error ? lineError.message : 'Không thể tạo lệnh'
          failedMessages.push(`Dòng ${index + 1}: ${message}`)
        }
      }

      if (successCount > 0) {
        await loadData()
      }

      if (failedMessages.length === 0) {
        setFeedback(`Đã tạo thành công ${successCount} lệnh sản xuất`)
        setOrderBatchNo(`PO-${Date.now()}`)
        setCreateOrderLines([buildDefaultCreateLine()])
        setShowCreateOrderModal(false)
        return
      }

      setFeedback(`Đã tạo ${successCount}/${createOrderLines.length} lệnh. ${failedMessages[0]}`)
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

    if (actualQty <= 0) {
      setFeedback('Sản lượng thực tế phải lớn hơn 0')
      return
    }

    setProcessingOrderId(orderId)
    setFeedback(null)
    try {
      await apiClient.completeProductionOrder({
        orderId,
        actualQty,
        outputUnitCost: 0,
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
    setInventoryReferenceNo(`FG-${Date.now()}`)
    const firstActiveProduct = activeFinishedGoods[0]
    setIssueLines([
      {
        id: crypto.randomUUID(),
        finishedGoodId: firstActiveProduct?.id ?? '',
        quantity: '1',
        unitCost: '0'
      }
    ])
    setFeedback(null)
    setShowInventoryModal(true)
  }

  const handleCloseInventoryModal = () => {
    setShowInventoryModal(false)
  }

  const handleOpenCreateOrderModal = () => {
    setFeedback(null)
    setOrderBatchNo(`PO-${Date.now()}`)
    setCreateOrderLines([buildDefaultCreateLine()])
    setShowCreateOrderModal(true)
  }

  const handleCloseCreateOrderModal = () => {
    setShowCreateOrderModal(false)
  }

  const handleAddCreateOrderLine = () => {
    setCreateOrderLines((previous) => [...previous, buildDefaultCreateLine()])
  }

  const handleRemoveCreateOrderLine = (lineId: string) => {
    setCreateOrderLines((previous) => {
      if (previous.length <= 1) {
        return previous
      }
      return previous.filter((line) => line.id !== lineId)
    })
  }

  const handleUpdateCreateOrderLine = (lineId: string, patch: Partial<CreateOrderLine>) => {
    setCreateOrderLines((previous) => previous.map((line) => (line.id === lineId ? { ...line, ...patch } : line)))
  }

  const handleAddIssueLine = () => {
    const firstActiveProduct = activeFinishedGoods[0]
    setIssueLines((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        finishedGoodId: firstActiveProduct?.id ?? '',
        quantity: '1',
        unitCost: '0'
      }
    ])
  }

  const handleRemoveIssueLine = (lineId: string) => {
    setIssueLines((previous) => {
      if (previous.length <= 1) {
        return previous
      }
      return previous.filter((line) => line.id !== lineId)
    })
  }

  const handleUpdateIssueLine = (lineId: string, patch: Partial<IssueLine>) => {
    setIssueLines((previous) => previous.map((line) => (line.id === lineId ? { ...line, ...patch } : line)))
  }

  const handleSubmitInventoryAction = async (event: React.FormEvent) => {
    event.preventDefault()
    if (issueLines.length === 0) {
      setFeedback('Vui lòng thêm ít nhất một sản phẩm để xuất kho')
      return
    }

    const invalidLine = issueLines.find((line) => {
      const qty = Number(line.quantity)
      const unitCost = Number(line.unitCost)
      return !line.finishedGoodId || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitCost) || unitCost < 0
    })
    if (invalidLine) {
      setFeedback('Mỗi dòng xuất kho cần chọn sản phẩm, số lượng > 0 và đơn giá hợp lệ')
      return
    }

    const insufficientLine = issueLines.find((line) => {
      const qty = Number(line.quantity)
      const stockQty = finishedGoodStockMap.get(line.finishedGoodId) ?? 0
      return qty > stockQty
    })
    if (insufficientLine) {
      const productCode = finishedGoodMap.get(insufficientLine.finishedGoodId)?.code ?? insufficientLine.finishedGoodId
      const stockQty = finishedGoodStockMap.get(insufficientLine.finishedGoodId) ?? 0
      setFeedback(`Tồn kho không đủ cho ${productCode}. Hiện có ${stockQty}`)
      return
    }

    setSubmitting(true)
    setFeedback(null)

    let successCount = 0
    const failedMessages: string[] = []

    try {
      for (const [index, line] of issueLines.entries()) {
        try {
          await apiClient.createFinishedGoodIssue({
            warehouseId: getDefaultWarehouseId(),
            finishedGoodId: line.finishedGoodId,
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost),
            movedAt: new Date().toISOString(),
            referenceId: crypto.randomUUID(),
            referenceType: `FG_MANUAL_ISSUE_${inventoryReferenceNo}_${String(index + 1).padStart(2, '0')}`
          })
          successCount += 1
        } catch (lineError) {
          const message = lineError instanceof Error ? lineError.message : 'Không thể xuất kho'
          failedMessages.push(`Dòng ${index + 1}: ${message}`)
        }
      }

      await loadData()
      if (failedMessages.length === 0) {
        setShowInventoryModal(false)
        setFeedback(`Đã xuất kho thành công ${successCount} sản phẩm`)
        return
      }

      setFeedback(`Đã xuất ${successCount}/${issueLines.length} dòng. ${failedMessages[0]}`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật tồn kho thành phẩm')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenCancelIssueModal = (issue: FinishedGoodIssueRow) => {
    setCancelingIssue(issue)
    setCancelReason('')
  }

  const handleCloseCancelIssueModal = () => {
    setCancelingIssue(null)
    setCancelReason('')
  }

  const handleConfirmCancelIssue = async () => {
    if (!cancelingIssue) {
      return
    }
    if (!cancelReason.trim()) {
      setFeedback('Vui lòng nhập lý do huỷ')
      return
    }

    try {
      await apiClient.cancelFinishedGoodIssue({
        referenceType: cancelingIssue.referenceType,
        referenceId: cancelingIssue.referenceId,
        reason: cancelReason.trim()
      })
      await loadData()
      setFeedback(`Đã huỷ lệnh xuất kho ${cancelingIssue.referenceId}`)
      handleCloseCancelIssueModal()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể huỷ lệnh xuất kho thành phẩm')
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
        <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {currentView === 'INVENTORY'
            ? 'Xem tồn kho thành phẩm theo thời gian thực'
            : currentView === 'ORDERS'
              ? 'Quản lý và vận hành lệnh sản xuất'
              : 'Xuất kho thành phẩm và theo dõi lịch sử'}
        </span>
      </header>

      {feedback && <p className="text-sm">{feedback}</p>}

      {currentView === 'INVENTORY' && (
        <section className="surface-card p-4">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Quản lý tồn kho thành phẩm</h2>
              <p className="text-sm text-slate-500">Tồn thành phẩm chỉ tăng tự động sau khi lệnh sản xuất hoàn thành theo sản lượng thực tế</p>
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
      )}

      {currentView === 'ORDERS' && (
        <>
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
                      <p className="text-sm text-slate-600">
                        Sản phẩm:{' '}
                        {finishedGoodMap.get(order.finishedGoodId)
                          ? `${finishedGoodMap.get(order.finishedGoodId)?.code} - ${finishedGoodMap.get(order.finishedGoodId)?.name}`
                          : order.finishedGoodId}
                      </p>
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
                        disabled={processingOrderId === order.id || !canApproveProduction}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {processingOrderId === order.id ? 'Đang duyệt...' : 'Duyệt lệnh'}
                      </button>
                      {!canApproveProduction && (
                        <p className="mt-1 text-xs text-amber-700">Bạn chưa có quyền xét duyệt sản xuất</p>
                      )}
                    </div>
                  )}
                  {(order.status === 'RELEASED' || order.status === 'IN_PROGRESS') && (
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <input
                        placeholder="SL thực tế"
                        value={actualQtyByOrderId[order.id] ?? ''}
                        onChange={(event) => setActualQtyByOrderId((previous) => ({ ...previous, [order.id]: event.target.value }))}
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
        </>
      )}

      {currentView === 'ISSUES' && (
        <section className="surface-card p-4">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Xuất kho thành phẩm</h2>
              <p className="text-sm text-slate-500">Tạo phiếu xuất kho và theo dõi danh sách các lệnh đã xuất kho</p>
            </div>
            <button type="button" onClick={handleOpenInventoryModal} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white">
              Xuất kho thành phẩm
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Thời gian</th>
                  <th className="px-3 py-2">Mã TP</th>
                  <th className="px-3 py-2">Tên TP</th>
                  <th className="px-3 py-2">ĐVT</th>
                  <th className="px-3 py-2 text-right">Số lượng xuất</th>
                  <th className="px-3 py-2 text-right">Đơn giá</th>
                  <th className="px-3 py-2">Loại phiếu</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issueRows.map((row) => (
                  <tr key={row.id} className="bg-white">
                    <td className="px-3 py-3">{new Date(row.movedAt).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-3 font-medium">{row.code}</td>
                    <td className="px-3 py-3">{row.name}</td>
                    <td className="px-3 py-3">{row.uom}</td>
                    <td className="px-3 py-3 text-right font-semibold">{row.quantity}</td>
                    <td className="px-3 py-3 text-right">{row.unitCost}</td>
                    <td className="px-3 py-3">{row.referenceTypeLabel}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenCancelIssueModal(row)}
                        disabled={row.status === 'CANCELLED' || !canCancelIssue}
                        className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Huỷ lệnh
                      </button>
                    </td>
                  </tr>
                ))}
                {issueRows.length === 0 && (
                  <tr className="bg-white">
                    <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                      Chưa có lệnh xuất kho thành phẩm
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
                <span>Mã batch lệnh</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={orderBatchNo} onChange={(event) => setOrderBatchNo(event.target.value)} />
              </label>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Danh sách sản phẩm trong batch</p>
                  <button type="button" onClick={handleAddCreateOrderLine} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                    + Thêm sản phẩm
                  </button>
                </div>
                <div className="space-y-2">
                  {createOrderLines.map((line, index) => (
                    <div key={line.id} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 md:grid-cols-12">
                      <p className="text-xs text-slate-500 md:col-span-12">
                        Lệnh dự kiến: <span className="font-semibold">{orderBatchNo || 'PO'}</span>-{String(index + 1).padStart(2, '0')}
                      </p>
                      <label className="text-sm md:col-span-7">
                        <span>Sản phẩm</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                          value={line.finishedGoodId}
                          onChange={(event) => handleUpdateCreateOrderLine(line.id, { finishedGoodId: event.target.value })}
                        >
                          {activeFinishedGoods.map((finishedGood) => (
                            <option key={finishedGood.id} value={finishedGood.id}>
                              {finishedGood.code} - {finishedGood.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm md:col-span-3">
                        <span>SL kế hoạch</span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                          value={line.plannedQty}
                          onChange={(event) => handleUpdateCreateOrderLine(line.id, { plannedQty: event.target.value })}
                        />
                      </label>
                      <div className="md:col-span-2 md:self-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveCreateOrderLine(line.id)}
                          disabled={createOrderLines.length <= 1}
                          className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-600 disabled:opacity-50"
                        >
                          Xóa dòng
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={submitting || activeFinishedGoods.length === 0} className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {submitting ? 'Đang tạo...' : 'Tạo batch lệnh'}
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
                <span>Mã tham chiếu</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={inventoryReferenceNo} onChange={(event) => setInventoryReferenceNo(event.target.value)} />
              </label>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Danh sách sản phẩm xuất kho</p>
                  <button type="button" onClick={handleAddIssueLine} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                    + Thêm sản phẩm
                  </button>
                </div>
                <div className="space-y-2">
                  {issueLines.map((line, index) => (
                    <div key={line.id} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 md:grid-cols-12">
                      <p className="text-xs text-slate-500 md:col-span-12">
                        Dòng xuất kho #{index + 1}
                      </p>
                      <label className="text-sm md:col-span-5">
                        <span>Sản phẩm</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                          value={line.finishedGoodId}
                          onChange={(event) => handleUpdateIssueLine(line.id, { finishedGoodId: event.target.value })}
                        >
                          {activeFinishedGoods.map((finishedGood) => (
                            <option key={finishedGood.id} value={finishedGood.id}>
                              {finishedGood.code} - {finishedGood.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm md:col-span-2">
                        <span>Số lượng</span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                          value={line.quantity}
                          onChange={(event) => handleUpdateIssueLine(line.id, { quantity: event.target.value })}
                        />
                      </label>
                      <label className="text-sm md:col-span-2">
                        <span>Đơn giá</span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                          value={line.unitCost}
                          onChange={(event) => handleUpdateIssueLine(line.id, { unitCost: event.target.value })}
                        />
                      </label>
                      <div className="text-xs text-slate-500 md:col-span-2 md:self-end md:pb-2">
                        Tồn khả dụng: {finishedGoodStockMap.get(line.finishedGoodId) ?? 0}
                      </div>
                      <div className="md:col-span-1 md:self-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveIssueLine(line.id)}
                          disabled={issueLines.length <= 1}
                          className="w-full rounded-lg border border-rose-200 bg-white px-2 py-2 text-xs text-rose-600 disabled:opacity-50"
                        >
                          Xoá
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {submitting ? 'Đang xử lý...' : 'Xác nhận xuất'}
                </button>
                <button type="button" onClick={handleCloseInventoryModal} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                  Huỷ
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {cancelingIssue && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Xác nhận huỷ lệnh xuất kho">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Xác nhận huỷ lệnh xuất kho</h2>
              <button type="button" onClick={handleCloseCancelIssueModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm">
                Đóng
              </button>
            </div>
            <p className="mb-2 text-sm text-slate-700">
              Bạn đang huỷ lệnh xuất kho <span className="font-semibold">{cancelingIssue.referenceId}</span>. Vui lòng nhập lý do huỷ.
            </p>
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
              placeholder="Nhập lý do huỷ (bắt buộc)"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleConfirmCancelIssue}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Xác nhận huỷ
              </button>
              <button
                type="button"
                onClick={handleCloseCancelIssueModal}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
              >
                Huỷ bỏ
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default FinishedGoodsPage
