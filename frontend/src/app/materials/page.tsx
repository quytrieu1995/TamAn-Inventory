'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  apiClient,
  getDefaultWarehouseId,
  type InventoryActionRow,
  type MasterMaterial,
  type MasterSupplier,
  type MaterialStockRow
} from '../../lib/api'
import { useSession } from '../../hooks/use-session'
import TablePageSizeControl from '../../components/TablePageSizeControl'

type ActionMode = 'RECEIPT' | 'ISSUE' | 'DISPOSAL'

type ReceiptLine = {
  materialId: string
  batchNo: string
  quantity: string
  unitPrice: string
}

type MaterialFormState = {
  code: string
  name: string
  uom: string
  minimumStock: string
  maxStorageDays: string
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type MaterialSubTab = 'WAREHOUSE' | 'CATALOG'
type ActionHistoryTab = 'RECEIPT' | 'ISSUE' | 'DISPOSAL'

const MATERIAL_UOM_OPTIONS = ['kg', 'g', 'ml', 'l'] as const

const MaterialsPage = () => {
  const searchParams = useSearchParams()
  const { session } = useSession()
  const [materialRows, setMaterialRows] = useState<MaterialStockRow[]>([])
  const [materials, setMaterials] = useState<MasterMaterial[]>([])
  const [suppliers, setSuppliers] = useState<MasterSupplier[]>([])
  const [activeMode, setActiveMode] = useState<ActionMode>('RECEIPT')
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [quantity, setQuantity] = useState('10')
  const [supplierId, setSupplierId] = useState('')
  const [receiptNo, setReceiptNo] = useState(`PNK-${Date.now()}`)
  const [receiptNote, setReceiptNote] = useState('')
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([])
  const [inventoryActions, setInventoryActions] = useState<InventoryActionRow[]>([])
  const [cancelingAction, setCancelingAction] = useState<InventoryActionRow | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [materialForm, setMaterialForm] = useState<MaterialFormState>({
    code: '',
    name: '',
    uom: 'kg',
    minimumStock: '0',
    maxStorageDays: '30'
  })
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)
  const [showActionModal, setShowActionModal] = useState(false)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [actionHistoryTab, setActionHistoryTab] = useState<ActionHistoryTab>('RECEIPT')
  const [tablePageSize, setTablePageSize] = useState<10 | 20 | 50>(10)
  const materialSubTab: MaterialSubTab = searchParams.get('view') === 'catalog' ? 'CATALOG' : 'WAREHOUSE'

  const canReceive = session?.permissions.includes('inventory.receive') ?? false
  const canIssue = session?.permissions.includes('inventory.issue') ?? false
  const canAdjust = session?.permissions.includes('inventory.adjust') ?? false
  const canCancelInventory = (session?.permissions.includes('inventory.cancel') ?? false) || canAdjust
  const canManageMaterial = session?.permissions.includes('material.manage') ?? false

  const loadData = async () => {
    const [stocks, masters, supplierRows, actionRows] = await Promise.all([
      apiClient.getMaterialStocks(),
      apiClient.getMaterialsMaster(),
      apiClient.getSuppliersMaster(),
      apiClient.getInventoryActions()
    ])
    setMaterialRows(stocks)
    setMaterials(masters)
    setSuppliers(supplierRows)
    setInventoryActions(actionRows)
    if (masters.length > 0) {
      const selectedStillActive = masters.some((material) => material.id === selectedMaterialId && material.isActive)
      if (!selectedStillActive) {
        const activeMaterial = masters.find((material) => material.isActive)
        setSelectedMaterialId(activeMaterial ? activeMaterial.id : '')
      }
    }
    if (!supplierId && supplierRows.length > 0) {
      setSupplierId(supplierRows[0].id)
    }
    if (receiptLines.length === 0 && masters.length > 0) {
      const activeMaterial = masters.find((material) => material.isActive)
      if (!activeMaterial) {
        setReceiptLines([])
        return
      }
      setReceiptLines([
        {
          materialId: activeMaterial.id,
          batchNo: `BATCH-${Date.now()}`,
          quantity: '10',
          unitPrice: '20000'
        }
      ])
    }
  }

  useEffect(() => {
    loadData().catch((error) => {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải dữ liệu nguyên liệu')
    })
  }, [])

  const totalSku = useMemo(() => new Set(materialRows.map((row) => row.code)).size, [materialRows])
  const activeMaterials = useMemo(() => materials.filter((material) => material.isActive), [materials])
  const filteredMaterials = useMemo(() => {
    if (statusFilter === 'ACTIVE') {
      return materials.filter((material) => material.isActive)
    }
    if (statusFilter === 'INACTIVE') {
      return materials.filter((material) => !material.isActive)
    }
    return materials
  }, [materials, statusFilter])
  const lowStockRows = useMemo(
    () => materialRows.filter((row) => row.quantityOnHand <= row.minimumStock),
    [materialRows]
  )
  const overAgeRows = useMemo(() => materialRows.filter((row) => row.storageDays >= 30), [materialRows])
  const filteredInventoryActions = useMemo(() => {
    return inventoryActions.filter((action) => action.actionType === actionHistoryTab)
  }, [actionHistoryTab, inventoryActions])
  const visibleMaterialRows = useMemo(() => materialRows.slice(0, tablePageSize), [materialRows, tablePageSize])
  const visibleInventoryActions = useMemo(() => filteredInventoryActions.slice(0, tablePageSize), [filteredInventoryActions, tablePageSize])
  const visibleCatalogMaterials = useMemo(() => filteredMaterials.slice(0, tablePageSize), [filteredMaterials, tablePageSize])

  const handleReceiptLineChange = (index: number, field: keyof ReceiptLine, value: string) => {
    setReceiptLines((previous) => {
      return previous.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line
        }
        return {
          ...line,
          [field]: value
        }
      })
    })
  }

  const handleAddReceiptLine = () => {
    if (!activeMaterials.length) {
      return
    }
    setReceiptLines((previous) => [
      ...previous,
      {
        materialId: activeMaterials[0].id,
        batchNo: `BATCH-${Date.now()}`,
        quantity: '10',
        unitPrice: '20000'
      }
    ])
  }

  const handleRemoveReceiptLine = (index: number) => {
    setReceiptLines((previous) => previous.filter((_, lineIndex) => lineIndex !== index))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      const referenceId = crypto.randomUUID()
      const payloadItem = {
        materialId: selectedMaterialId,
        quantity: Number(quantity)
      }

      if (activeMode === 'RECEIPT') {
        if (receiptLines.length === 0) {
          throw new Error('Phiếu nhập cần ít nhất một dòng nguyên liệu')
        }

        await apiClient.createReceipt({
          receiptId: referenceId,
          receiptNo,
          supplierId,
          warehouseId: getDefaultWarehouseId(),
          receivedAt: new Date().toISOString(),
          note: receiptNote,
          items: receiptLines.map((line) => ({
            materialId: line.materialId,
            batchNo: line.batchNo,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice)
          }))
        })
      }

      if (activeMode === 'ISSUE') {
        await apiClient.createIssue({
          warehouseId: getDefaultWarehouseId(),
          referenceId,
          referenceType: 'MANUAL_ISSUE',
          movedAt: new Date().toISOString(),
          items: [payloadItem]
        })
      }

      if (activeMode === 'DISPOSAL') {
        await apiClient.createDisposal({
          warehouseId: getDefaultWarehouseId(),
          referenceId,
          movedAt: new Date().toISOString(),
          items: [payloadItem]
        })
      }

      await loadData()
      setFeedback('Thao tác thành công')
    } catch (submitError) {
      setFeedback(submitError instanceof Error ? submitError.message : 'Thao tác thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitMaterialForm = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const payload = {
        code: materialForm.code,
        name: materialForm.name,
        uom: materialForm.uom,
        minimumStock: Number(materialForm.minimumStock),
        maxStorageDays: Number(materialForm.maxStorageDays)
      }

      if (editingMaterialId) {
        await apiClient.updateMaterial(editingMaterialId, payload)
        setFeedback('Đã cập nhật nguyên liệu')
      } else {
        await apiClient.createMaterial(payload)
        setFeedback('Đã thêm nguyên liệu')
      }

      setMaterialForm({
        code: '',
        name: '',
        uom: 'kg',
        minimumStock: '0',
        maxStorageDays: '30'
      })
      setEditingMaterialId(null)
      setShowMaterialModal(false)
      await loadData()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể lưu nguyên liệu')
    }
  }

  const resetMaterialForm = () => {
    setEditingMaterialId(null)
    setMaterialForm({
      code: '',
      name: '',
      uom: 'kg',
      minimumStock: '0',
      maxStorageDays: '30'
    })
  }

  const handleOpenCreateMaterialModal = () => {
    resetMaterialForm()
    setFeedback(null)
    setShowMaterialModal(true)
  }

  const handleCloseMaterialModal = () => {
    setShowMaterialModal(false)
    resetMaterialForm()
  }

  const handleEditMaterial = (material: MasterMaterial) => {
    setEditingMaterialId(material.id)
    setMaterialForm({
      code: material.code,
      name: material.name,
      uom: material.uom,
      minimumStock: String(material.minimumStock),
      maxStorageDays: String(material.maxStorageDays)
    })
    setFeedback(null)
    setShowMaterialModal(true)
  }

  const handleDeleteMaterial = async (materialId: string) => {
    try {
      await apiClient.deleteMaterial(materialId)
      setFeedback('Đã xoá nguyên liệu')
      await loadData()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể xoá nguyên liệu')
    }
  }

  const handleToggleMaterialStatus = async (materialId: string, isActive: boolean) => {
    try {
      await apiClient.updateMaterialStatus(materialId, !isActive)
      setMaterials((previous) => previous.map((material) => {
        if (material.id !== materialId) {
          return material
        }
        return {
          ...material,
          isActive: !isActive
        }
      }))
      setFeedback(!isActive ? 'Đã kích hoạt nguyên liệu' : 'Đã chuyển nguyên liệu sang ngừng hoạt động')
      await loadData()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái nguyên liệu')
    }
  }

  const handleOpenActionModal = (mode: ActionMode) => {
    setActiveMode(mode)
    setFeedback(null)
    setShowActionModal(true)
  }

  const handleCloseActionModal = () => {
    setShowActionModal(false)
  }

  const handleOpenCancelActionModal = (action: InventoryActionRow) => {
    setCancelingAction(action)
    setCancelReason('')
  }

  const handleCloseCancelActionModal = () => {
    setCancelingAction(null)
    setCancelReason('')
  }

  const handleConfirmCancelInventoryAction = async () => {
    if (!cancelingAction) {
      return
    }
    if (cancelingAction.referenceType === 'MANUAL_ISSUE') {
      setFeedback('Phiếu xuất dựa trên lệnh đặt hàng không hỗ trợ huỷ')
      handleCloseCancelActionModal()
      return
    }
    if (!cancelReason.trim()) {
      setFeedback('Vui lòng nhập lý do huỷ')
      return
    }
    try {
      await apiClient.cancelInventoryAction({
        referenceType: cancelingAction.referenceType,
        referenceId: cancelingAction.referenceId,
        reason: cancelReason.trim()
      })
      await loadData()
      setFeedback(`Đã huỷ ${cancelingAction.documentNo}`)
      handleCloseCancelActionModal()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể huỷ phiếu')
    }
  }

  const canSubmit = activeMode === 'RECEIPT'
    ? canReceive
    : activeMode === 'ISSUE'
      ? canIssue
      : canAdjust
  const canCancelAction = (action: InventoryActionRow) => {
    if (!canCancelInventory) {
      return false
    }
    if (action.actionType === 'ISSUE') {
      return false
    }
    return action.status !== 'CANCELLED'
  }
  const hasValidSelection = activeMode === 'RECEIPT'
    ? activeMaterials.length > 0
    : activeMaterials.some((material) => material.id === selectedMaterialId)

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold md:text-3xl">Quản lý nguyên vật liệu</h1>
          <p className="muted-text text-sm md:text-base">
            Tạo phiếu nhập, xuất và huỷ NVL theo lô, đồng thời theo dõi tồn kho theo thời gian thực.
          </p>
        </div>
      </header>

      {materialSubTab === 'WAREHOUSE' && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <article className="surface-card p-4">
              <p className="text-xs uppercase text-slate-500">Tổng SKU</p>
              <p className="mt-1 text-2xl font-semibold">{totalSku}</p>
            </article>
            <article className="surface-card p-4">
              <p className="text-xs uppercase text-slate-500">SKU cần cảnh báo</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">{lowStockRows.length}</p>
            </article>
            <article className="surface-card p-4">
              <p className="text-xs uppercase text-slate-500">Lô quá ngày</p>
              <p className="mt-1 text-2xl font-semibold text-rose-600">{overAgeRows.length}</p>
            </article>
          </section>

          <section className="surface-card p-4">
            <h2 className="mb-3 text-base font-semibold">Phiếu nhập / xuất / huỷ</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleOpenActionModal('RECEIPT')} disabled={!canReceive} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">Phiếu nhập</button>
              <button type="button" onClick={() => handleOpenActionModal('ISSUE')} disabled={!canIssue} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">Phiếu xuất</button>
              <button type="button" onClick={() => handleOpenActionModal('DISPOSAL')} disabled={!canAdjust} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">Phiếu huỷ</button>
            </div>
            {activeMaterials.length === 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
                Không có nguyên liệu đang hoạt động để chọn cho phiếu nhập/xuất/huỷ.
              </p>
            )}
          </section>

          <section className="surface-card hidden overflow-x-auto md:block">
            <div className="mb-3 p-4 pb-0">
              <TablePageSizeControl value={tablePageSize} onChange={setTablePageSize} />
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Mã NVL</th>
                  <th className="px-4 py-3">Tên NVL</th>
                  <th className="px-4 py-3">Lô</th>
                  <th className="px-4 py-3 text-right">Tồn hiện tại</th>
                  <th className="px-4 py-3 text-right">Tồn tối thiểu</th>
                  <th className="px-4 py-3 text-right">Số ngày lưu kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleMaterialRows.map((row) => (
                  <tr key={`${row.code}-${row.batchNo}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{row.code}</td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">{row.batchNo}</td>
                    <td className="px-4 py-3 text-right font-semibold">{row.quantityOnHand}</td>
                    <td className="px-4 py-3 text-right">{row.minimumStock}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`status-pill ${row.storageDays >= 30 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {row.storageDays} ngày
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="surface-card p-4">
            <h2 className="mb-3 text-base font-semibold">Lịch sử phiếu nhập / xuất / huỷ</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActionHistoryTab('RECEIPT')}
                className={`rounded-lg px-3 py-1 text-xs ${actionHistoryTab === 'RECEIPT' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
              >
                Phiếu nhập
              </button>
              <button
                type="button"
                onClick={() => setActionHistoryTab('ISSUE')}
                className={`rounded-lg px-3 py-1 text-xs ${actionHistoryTab === 'ISSUE' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
              >
                Phiếu xuất
              </button>
              <button
                type="button"
                onClick={() => setActionHistoryTab('DISPOSAL')}
                className={`rounded-lg px-3 py-1 text-xs ${actionHistoryTab === 'DISPOSAL' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
              >
                Phiếu huỷ
              </button>
            </div>
            <div className="mb-3">
              <TablePageSizeControl value={tablePageSize} onChange={setTablePageSize} />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Chứng từ</th>
                    <th className="px-3 py-2">Loại phiếu</th>
                    <th className="px-3 py-2">Thời gian</th>
                    <th className="px-3 py-2 text-right">Tổng SL</th>
                    <th className="px-3 py-2">Trạng thái</th>
                    <th className="px-3 py-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visibleInventoryActions.map((action) => (
                    <tr key={`${action.referenceType}-${action.referenceId}`}>
                      <td className="px-3 py-2 font-semibold">{action.documentNo}</td>
                      <td className="px-3 py-2">
                        {action.actionType === 'RECEIPT' ? 'Phiếu nhập' : action.actionType === 'ISSUE' ? 'Phiếu xuất' : 'Phiếu huỷ'}
                      </td>
                      <td className="px-3 py-2">{new Date(action.movedAt).toLocaleString('vi-VN')}</td>
                      <td className="px-3 py-2 text-right">{action.totalQuantity}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${action.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {action.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {action.actionType === 'ISSUE' ? (
                          <span className="text-xs text-slate-400">Không hỗ trợ</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenCancelActionModal(action)}
                            disabled={!canCancelAction(action)}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Huỷ phiếu
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleInventoryActions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                        Chưa có dữ liệu cho loại phiếu này
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {materialSubTab === 'CATALOG' && (
        <>
          <section className="surface-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Danh mục nguyên liệu</h2>
                <p className="text-sm text-slate-500">Bấm nút để mở popup thêm mới nguyên liệu</p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateMaterialModal}
                disabled={!canManageMaterial}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                + Thêm NVL
              </button>
            </div>
            {!canManageMaterial && <p className="mt-2 text-sm text-amber-700">Bạn không có quyền material.manage</p>}
          </section>

          <section className="surface-card p-4">
            <h2 className="mb-3 text-base font-semibold">Danh sách nguyên liệu</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setStatusFilter('ALL')} className={`rounded-lg px-3 py-1 text-xs ${statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>Tất cả</button>
              <button type="button" onClick={() => setStatusFilter('ACTIVE')} className={`rounded-lg px-3 py-1 text-xs ${statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>Hoạt động</button>
              <button type="button" onClick={() => setStatusFilter('INACTIVE')} className={`rounded-lg px-3 py-1 text-xs ${statusFilter === 'INACTIVE' ? 'bg-rose-600 text-white' : 'bg-slate-100'}`}>Ngừng hoạt động</button>
            </div>
            <div className="mb-3">
              <TablePageSizeControl value={tablePageSize} onChange={setTablePageSize} />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Mã NVL</th>
                    <th className="px-3 py-2">Tên NVL</th>
                    <th className="px-3 py-2">ĐVT</th>
                    <th className="px-3 py-2 text-right">Tồn tối thiểu</th>
                    <th className="px-3 py-2 text-right">Số ngày lưu kho tối đa</th>
                    <th className="px-3 py-2">Trạng thái</th>
                    <th className="px-3 py-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visibleCatalogMaterials.map((material) => (
                    <tr key={material.id}>
                      <td className="px-3 py-2 font-medium">{material.code}</td>
                      <td className="px-3 py-2">{material.name}</td>
                      <td className="px-3 py-2">{material.uom}</td>
                      <td className="px-3 py-2 text-right">{material.minimumStock}</td>
                      <td className="px-3 py-2 text-right">{material.maxStorageDays}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${material.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {material.isActive ? 'Hoạt động' : 'Ngừng hoạt động'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => handleEditMaterial(material)} disabled={!canManageMaterial} className="rounded-lg border border-slate-200 px-3 py-1 text-xs disabled:opacity-50">Sửa</button>
                          <button type="button" onClick={() => handleDeleteMaterial(material.id)} disabled={!canManageMaterial} className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-600 disabled:opacity-50">Xoá</button>
                          <button
                            type="button"
                            onClick={() => handleToggleMaterialStatus(material.id, material.isActive)}
                            disabled={!canManageMaterial}
                            className="rounded-lg border border-blue-200 px-3 py-1 text-xs text-blue-600 disabled:opacity-50"
                          >
                            {material.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleCatalogMaterials.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                        Không có nguyên liệu theo bộ lọc đã chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label={editingMaterialId ? 'Cập nhật nguyên liệu' : 'Thêm nguyên liệu'}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editingMaterialId ? 'Cập nhật nguyên liệu' : 'Thêm nguyên liệu mới'}</h2>
              <button type="button" onClick={handleCloseMaterialModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm">Đóng</button>
            </div>
            <form onSubmit={handleSubmitMaterialForm} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Mã NVL" value={materialForm.code} onChange={(event) => setMaterialForm((previous) => ({ ...previous, code: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Tên NVL" value={materialForm.name} onChange={(event) => setMaterialForm((previous) => ({ ...previous, name: event.target.value }))} />
              <select
                className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                value={materialForm.uom}
                onChange={(event) => setMaterialForm((previous) => ({ ...previous, uom: event.target.value }))}
              >
                {MATERIAL_UOM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Tồn tối thiểu" value={materialForm.minimumStock} onChange={(event) => setMaterialForm((previous) => ({ ...previous, minimumStock: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm md:col-span-2" placeholder="Số ngày lưu kho tối đa" value={materialForm.maxStorageDays} onChange={(event) => setMaterialForm((previous) => ({ ...previous, maxStorageDays: event.target.value }))} />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button type="submit" disabled={!canManageMaterial} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {editingMaterialId ? 'Cập nhật NVL' : 'Thêm NVL'}
                </button>
                <button type="button" onClick={handleCloseMaterialModal} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                  Huỷ
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Thao tác phiếu kho">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {activeMode === 'RECEIPT' ? 'Phiếu nhập kho nguyên liệu' : activeMode === 'ISSUE' ? 'Phiếu xuất kho nguyên liệu' : 'Phiếu huỷ nguyên liệu'}
              </h2>
              <button type="button" onClick={handleCloseActionModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm">Đóng</button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {activeMode !== 'RECEIPT' && (
                <>
                  <label className="text-sm">
                    <span>Mã nguyên liệu</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
                      value={selectedMaterialId}
                      onChange={(event) => setSelectedMaterialId(event.target.value)}
                    >
                      {activeMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.code} - {material.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <span>Số lượng</span>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                  </label>
                </>
              )}

              {activeMode === 'RECEIPT' && (
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="text-sm">
                      <span>Nhà cung cấp</span>
                      <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.code} - {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span>Số phiếu nhập</span>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={receiptNo} onChange={(event) => setReceiptNo(event.target.value)} />
                    </label>
                    <label className="text-sm">
                      <span>Ghi chú</span>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2" value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} />
                    </label>
                  </div>

                  <div className="mt-3 space-y-2">
                    {receiptLines.map((line, index) => (
                      <div key={`${index}-${line.batchNo}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-5">
                        <select className="rounded-lg border border-slate-200 bg-white p-2 text-sm" value={line.materialId} onChange={(event) => handleReceiptLineChange(index, 'materialId', event.target.value)}>
                          {activeMaterials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.code}
                            </option>
                          ))}
                        </select>
                        <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Mã lô" value={line.batchNo} onChange={(event) => handleReceiptLineChange(index, 'batchNo', event.target.value)} />
                        <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Số lượng" value={line.quantity} onChange={(event) => handleReceiptLineChange(index, 'quantity', event.target.value)} />
                        <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Đơn giá" value={line.unitPrice} onChange={(event) => handleReceiptLineChange(index, 'unitPrice', event.target.value)} />
                        <button type="button" onClick={() => handleRemoveReceiptLine(index)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600">Xoá dòng</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={handleAddReceiptLine} className="mt-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    + Thêm dòng nguyên liệu
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={!canSubmit || !hasValidSelection || submitting}
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Đang xử lý...' : 'Thực hiện'}
                </button>
                <button type="button" onClick={handleCloseActionModal} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                  Huỷ
                </button>
              </div>
            </form>

            {!canSubmit && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
                Tài khoản hiện tại chưa được phân quyền cho thao tác này.
              </p>
            )}
          </section>
        </div>
      )}

      {cancelingAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Xác nhận huỷ phiếu">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Xác nhận huỷ phiếu</h2>
              <button type="button" onClick={handleCloseCancelActionModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm">
                Đóng
              </button>
            </div>
            <p className="mb-2 text-sm text-slate-700">
              Bạn đang huỷ chứng từ <span className="font-semibold">{cancelingAction.documentNo}</span>. Vui lòng nhập lý do huỷ.
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
                onClick={handleConfirmCancelInventoryAction}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Xác nhận huỷ
              </button>
              <button
                type="button"
                onClick={handleCloseCancelActionModal}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
              >
                Huỷ bỏ
              </button>
            </div>
          </section>
        </div>
      )}

      {feedback && <p className="text-sm">{feedback}</p>}
    </main>
  )
}

export default MaterialsPage
