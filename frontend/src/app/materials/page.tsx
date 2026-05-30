'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  apiClient,
  getDefaultWarehouseId,
  type MasterMaterial,
  type MasterSupplier,
  type MaterialStockRow
} from '../../lib/api'
import { useSession } from '../../hooks/use-session'

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

const MaterialsPage = () => {
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

  const canReceive = session?.permissions.includes('inventory.receive') ?? false
  const canIssue = session?.permissions.includes('inventory.issue') ?? false
  const canAdjust = session?.permissions.includes('inventory.adjust') ?? false
  const canManageMaterial = session?.permissions.includes('material.manage') ?? false

  const loadData = async () => {
    const [stocks, masters, supplierRows] = await Promise.all([
      apiClient.getMaterialStocks(),
      apiClient.getMaterialsMaster(),
      apiClient.getSuppliersMaster()
    ])
    setMaterialRows(stocks)
    setMaterials(masters)
    setSuppliers(supplierRows)
    if (!selectedMaterialId && masters.length > 0) {
      setSelectedMaterialId(masters[0].id)
    }
    if (!supplierId && supplierRows.length > 0) {
      setSupplierId(supplierRows[0].id)
    }
    if (receiptLines.length === 0 && masters.length > 0) {
      setReceiptLines([
        {
          materialId: masters[0].id,
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
  const lowStockRows = useMemo(
    () => materialRows.filter((row) => row.quantityOnHand <= row.minimumStock),
    [materialRows]
  )
  const overAgeRows = useMemo(() => materialRows.filter((row) => row.storageDays >= 30), [materialRows])

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
    if (!materials.length) {
      return
    }
    setReceiptLines((previous) => [
      ...previous,
      {
        materialId: materials[0].id,
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
      await loadData()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể lưu nguyên liệu')
    }
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

  const canSubmit = activeMode === 'RECEIPT'
    ? canReceive
    : activeMode === 'ISSUE'
      ? canIssue
      : canAdjust

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
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveMode('RECEIPT')} className={`rounded-lg px-3 py-2 text-sm ${activeMode === 'RECEIPT' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Phiếu nhập</button>
          <button type="button" onClick={() => setActiveMode('ISSUE')} className={`rounded-lg px-3 py-2 text-sm ${activeMode === 'ISSUE' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Phiếu xuất</button>
          <button type="button" onClick={() => setActiveMode('DISPOSAL')} className={`rounded-lg px-3 py-2 text-sm ${activeMode === 'DISPOSAL' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Phiếu huỷ</button>
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
                  {materials.map((material) => (
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
                      {materials.map((material) => (
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

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Đang xử lý...' : 'Thực hiện'}
          </button>
        </form>

        {!canSubmit && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
            Tài khoản hiện tại chưa được phân quyền cho thao tác này.
          </p>
        )}
        {feedback && <p className="mt-2 text-sm">{feedback}</p>}
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Thêm / sửa nguyên liệu</h2>
        <form onSubmit={handleSubmitMaterialForm} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Mã NVL" value={materialForm.code} onChange={(event) => setMaterialForm((previous) => ({ ...previous, code: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Tên NVL" value={materialForm.name} onChange={(event) => setMaterialForm((previous) => ({ ...previous, name: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Đơn vị" value={materialForm.uom} onChange={(event) => setMaterialForm((previous) => ({ ...previous, uom: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Tồn tối thiểu" value={materialForm.minimumStock} onChange={(event) => setMaterialForm((previous) => ({ ...previous, minimumStock: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Số ngày lưu kho tối đa" value={materialForm.maxStorageDays} onChange={(event) => setMaterialForm((previous) => ({ ...previous, maxStorageDays: event.target.value }))} />
          <button type="submit" disabled={!canManageMaterial} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {editingMaterialId ? 'Cập nhật NVL' : 'Thêm NVL'}
          </button>
        </form>
        {!canManageMaterial && <p className="mt-2 text-sm text-amber-700">Bạn không có quyền material.manage</p>}
      </section>

      <section className="surface-card hidden overflow-x-auto md:block">
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
            {materialRows.map((row) => (
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
        <h2 className="mb-3 text-base font-semibold">Danh mục nguyên liệu</h2>
        <div className="space-y-2">
          {materials.map((material) => (
            <div key={material.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">{material.code} - {material.name}</p>
                <p className="text-xs text-slate-500">Min: {material.minimumStock} {material.uom} | Max days: {material.maxStorageDays}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleEditMaterial(material)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs">Sửa</button>
                <button type="button" onClick={() => handleDeleteMaterial(material.id)} className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-600">Xoá</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default MaterialsPage
