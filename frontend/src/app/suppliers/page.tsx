'use client'

import { useEffect, useState } from 'react'
import { apiClient, formatCurrencyVnd, type PurchaseReceiptDetail, type SupplierDetailResponse, type SupplierRow } from '../../lib/api'
import { useSession } from '../../hooks/use-session'

type SupplierFormState = {
  code: string
  name: string
  contactName: string
  phone: string
  email: string
  paymentTerms: string
}

const defaultFormState: SupplierFormState = {
  code: '',
  name: '',
  contactName: '',
  phone: '',
  email: '',
  paymentTerms: ''
}

const SuppliersPage = () => {
  const { session } = useSession()
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [form, setForm] = useState<SupplierFormState>(defaultFormState)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showSupplierDetailModal, setShowSupplierDetailModal] = useState(false)
  const [loadingSupplierDetail, setLoadingSupplierDetail] = useState(false)
  const [supplierDetail, setSupplierDetail] = useState<SupplierDetailResponse | null>(null)
  const [showReceiptDetailModal, setShowReceiptDetailModal] = useState(false)
  const [loadingReceiptDetail, setLoadingReceiptDetail] = useState(false)
  const [receiptDetail, setReceiptDetail] = useState<PurchaseReceiptDetail | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const canManage = session?.permissions.includes('supplier.manage') ?? false

  const loadSuppliers = async () => {
    const rows = await apiClient.getSuppliers()
    setSuppliers(rows)
  }

  useEffect(() => {
    if (!canManage) {
      return
    }
    loadSuppliers().catch((error) => {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải nhà cung cấp')
    })
  }, [canManage])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (editingId) {
        await apiClient.updateSupplier(editingId, form)
        setFeedback('Đã cập nhật nhà cung cấp')
      } else {
        await apiClient.createSupplier(form)
        setFeedback('Đã thêm nhà cung cấp')
      }
      setForm(defaultFormState)
      setEditingId(null)
      setShowSupplierModal(false)
      await loadSuppliers()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể lưu nhà cung cấp')
    }
  }

  const handleOpenCreateSupplierModal = () => {
    setEditingId(null)
    setForm(defaultFormState)
    setFeedback(null)
    setShowSupplierModal(true)
  }

  const handleCloseSupplierModal = () => {
    setShowSupplierModal(false)
    setEditingId(null)
    setForm(defaultFormState)
  }

  const handleEdit = (supplier: SupplierRow) => {
    setEditingId(supplier.id)
    setForm({
      code: supplier.code,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      paymentTerms: supplier.paymentTerms
    })
    setFeedback(null)
    setShowSupplierModal(true)
  }

  const handleDelete = async (supplierId: string) => {
    try {
      await apiClient.deleteSupplier(supplierId)
      setFeedback('Đã xoá nhà cung cấp')
      await loadSuppliers()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể xoá nhà cung cấp')
    }
  }

  const handleViewDetail = async (supplierId: string) => {
    try {
      setLoadingSupplierDetail(true)
      setFeedback(null)
      const detail = await apiClient.getSupplierDetail(supplierId)
      setSupplierDetail(detail)
      setShowSupplierDetailModal(true)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải chi tiết nhà cung cấp')
    } finally {
      setLoadingSupplierDetail(false)
    }
  }

  const handleCloseSupplierDetailModal = () => {
    setShowSupplierDetailModal(false)
    setSupplierDetail(null)
  }

  const handleViewReceiptDetail = async (receiptId: string) => {
    try {
      setLoadingReceiptDetail(true)
      setFeedback(null)
      const detail = await apiClient.getPurchaseReceiptDetail(receiptId)
      setReceiptDetail(detail)
      setShowReceiptDetailModal(true)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải chi tiết phiếu nhập')
    } finally {
      setLoadingReceiptDetail(false)
    }
  }

  const handleCloseReceiptDetailModal = () => {
    setShowReceiptDetailModal(false)
    setReceiptDetail(null)
  }

  if (!canManage) {
    return (
      <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Bạn không có quyền quản lý nhà cung cấp
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <header>
        <h1 className="text-xl font-semibold md:text-3xl">Quản lý nhà cung cấp</h1>
        <p className="muted-text text-sm md:text-base">
          Quản lý thông tin nhà cung cấp phục vụ quy trình nhập nguyên liệu.
        </p>
      </header>

      <section className="surface-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Thao tác nhà cung cấp</h2>
            <p className="text-sm text-slate-500">Bấm nút để mở popup thêm nhà cung cấp mới</p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateSupplierModal}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            + Thêm nhà cung cấp
          </button>
        </div>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Danh sách nhà cung cấp</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Mã NCC</th>
                <th className="px-3 py-2">Tên NCC</th>
                <th className="px-3 py-2">Người liên hệ</th>
                <th className="px-3 py-2">Điện thoại</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Điều khoản thanh toán</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="bg-white">
                  <td className="px-3 py-3 font-medium">{supplier.code}</td>
                  <td className="px-3 py-3">{supplier.name}</td>
                  <td className="px-3 py-3">{supplier.contactName || '-'}</td>
                  <td className="px-3 py-3">{supplier.phone || '-'}</td>
                  <td className="px-3 py-3">{supplier.email || '-'}</td>
                  <td className="px-3 py-3">{supplier.paymentTerms || '-'}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleViewDetail(supplier.id)} disabled={loadingSupplierDetail} className="rounded-lg border border-blue-200 px-3 py-1 text-xs text-blue-600 disabled:opacity-50">Chi tiết</button>
                      <button type="button" onClick={() => handleEdit(supplier)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs">Sửa</button>
                      <button type="button" onClick={() => handleDelete(supplier.id)} className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-600">Xoá</button>
                    </div>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr className="bg-white">
                  <td colSpan={7} className="px-3 py-4 text-center text-sm text-slate-500">
                    Chưa có nhà cung cấp nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label={editingId ? 'Cập nhật nhà cung cấp' : 'Thêm nhà cung cấp'}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editingId ? 'Cập nhật nhà cung cấp' : 'Thêm nhà cung cấp'}</h2>
              <button type="button" onClick={handleCloseSupplierModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                Đóng
              </button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Mã NCC" value={form.code} onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Tên NCC" value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Người liên hệ" value={form.contactName} onChange={(event) => setForm((previous) => ({ ...previous, contactName: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Số điện thoại" value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Điều khoản thanh toán" value={form.paymentTerms} onChange={(event) => setForm((previous) => ({ ...previous, paymentTerms: event.target.value }))} />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white">
                  {editingId ? 'Lưu cập nhật' : 'Thêm mới'}
                </button>
                <button type="button" onClick={handleCloseSupplierModal} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
                  Huỷ
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showSupplierDetailModal && supplierDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Chi tiết nhà cung cấp">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Chi tiết nhà cung cấp</h2>
              <button type="button" onClick={handleCloseSupplierDetailModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                Đóng
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-2">
              <p><span className="font-semibold">Mã NCC:</span> {supplierDetail.supplier.code}</p>
              <p><span className="font-semibold">Tên NCC:</span> {supplierDetail.supplier.name}</p>
              <p><span className="font-semibold">Người liên hệ:</span> {supplierDetail.supplier.contactName || '-'}</p>
              <p><span className="font-semibold">Số điện thoại:</span> {supplierDetail.supplier.phone || '-'}</p>
              <p><span className="font-semibold">Email:</span> {supplierDetail.supplier.email || '-'}</p>
              <p><span className="font-semibold">Điều khoản thanh toán:</span> {supplierDetail.supplier.paymentTerms || '-'}</p>
            </div>

            <h3 className="mb-2 text-sm font-semibold">Đơn nhập của nhà cung cấp</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Số phiếu</th>
                    <th className="px-3 py-2">Ngày nhập</th>
                    <th className="px-3 py-2">Kho</th>
                    <th className="px-3 py-2 text-right">Số dòng</th>
                    <th className="px-3 py-2 text-right">Tổng SL</th>
                    <th className="px-3 py-2 text-right">Tổng tiền</th>
                    <th className="px-3 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierDetail.receipts.map((receipt) => (
                    <tr key={receipt.id} className="bg-white">
                      <td className="px-3 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => handleViewReceiptDetail(receipt.id)}
                          disabled={loadingReceiptDetail}
                          className="text-blue-600 underline underline-offset-2 disabled:opacity-50"
                        >
                          {receipt.receiptNo}
                        </button>
                      </td>
                      <td className="px-3 py-3">{new Date(receipt.receivedAt).toLocaleString('vi-VN')}</td>
                      <td className="px-3 py-3 text-xs">{receipt.warehouseId}</td>
                      <td className="px-3 py-3 text-right">{receipt.itemCount}</td>
                      <td className="px-3 py-3 text-right">{receipt.totalQuantity}</td>
                      <td className="px-3 py-3 text-right">{formatCurrencyVnd(receipt.totalAmount)}</td>
                      <td className="px-3 py-3">{receipt.note || '-'}</td>
                    </tr>
                  ))}
                  {supplierDetail.receipts.length === 0 && (
                    <tr className="bg-white">
                      <td colSpan={7} className="px-3 py-4 text-center text-sm text-slate-500">
                        Nhà cung cấp này chưa có đơn nhập nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {showReceiptDetailModal && receiptDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <section className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Chi tiết phiếu nhập">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Chi tiết phiếu nhập {receiptDetail.receiptNo}</h2>
              <button type="button" onClick={handleCloseReceiptDetailModal} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs">
                Đóng
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-2">
              <p><span className="font-semibold">Nhà cung cấp:</span> {receiptDetail.supplier.code} - {receiptDetail.supplier.name}</p>
              <p><span className="font-semibold">Ngày nhập:</span> {new Date(receiptDetail.receivedAt).toLocaleString('vi-VN')}</p>
              <p><span className="font-semibold">Mã kho:</span> {receiptDetail.warehouseId}</p>
              <p><span className="font-semibold">Ghi chú:</span> {receiptDetail.note || '-'}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">NVL</th>
                    <th className="px-3 py-2">Lô</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-right">Đơn giá</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receiptDetail.items.map((item) => (
                    <tr key={item.id} className="bg-white">
                      <td className="px-3 py-3">{item.materialCode} - {item.materialName} ({item.materialUom})</td>
                      <td className="px-3 py-3">{item.batchNo}</td>
                      <td className="px-3 py-3 text-right">{item.quantity}</td>
                      <td className="px-3 py-3 text-right">{formatCurrencyVnd(item.unitPrice)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrencyVnd(item.lineTotal)}</td>
                    </tr>
                  ))}
                  {receiptDetail.items.length === 0 && (
                    <tr className="bg-white">
                      <td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-500">
                        Phiếu nhập không có dòng hàng
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold">Tổng tiền</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold">
                      {formatCurrencyVnd(receiptDetail.items.reduce((sum, item) => sum + item.lineTotal, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}

      {feedback && <p className="text-sm">{feedback}</p>}
    </main>
  )
}

export default SuppliersPage
