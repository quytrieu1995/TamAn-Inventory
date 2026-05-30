'use client'

import { useEffect, useState } from 'react'
import { apiClient, type SupplierRow } from '../../lib/api'
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
      await loadSuppliers()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể lưu nhà cung cấp')
    }
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
        <h2 className="mb-3 text-base font-semibold">{editingId ? 'Cập nhật nhà cung cấp' : 'Thêm nhà cung cấp'}</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Mã NCC" value={form.code} onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Tên NCC" value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Người liên hệ" value={form.contactName} onChange={(event) => setForm((previous) => ({ ...previous, contactName: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Số điện thoại" value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 bg-white p-2 text-sm" placeholder="Điều khoản thanh toán" value={form.paymentTerms} onChange={(event) => setForm((previous) => ({ ...previous, paymentTerms: event.target.value }))} />
          <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white">
            {editingId ? 'Lưu cập nhật' : 'Thêm mới'}
          </button>
        </form>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Danh sách nhà cung cấp</h2>
        <div className="space-y-2">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">{supplier.code} - {supplier.name}</p>
                <p className="text-xs text-slate-500">{supplier.contactName} | {supplier.phone} | {supplier.email}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleEdit(supplier)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs">Sửa</button>
                <button type="button" onClick={() => handleDelete(supplier.id)} className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-600">Xoá</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {feedback && <p className="text-sm">{feedback}</p>}
    </main>
  )
}

export default SuppliersPage
