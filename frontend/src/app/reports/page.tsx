import PermissionGate from '../../components/PermissionGate'
import { mockSession } from '../../lib/auth'

const monthlySummary = {
  month: '2026-05',
  receiptAmount: 1240000000,
  issueAmount: 980000000,
  disposalAmount: 18000000,
  endingInventoryAmount: 2420000000
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(amount)
}

const ReportsPage = () => {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Bao cao thang</h1>
      <p className="text-sm text-slate-600">
        Bao cao xuat, nhap, huy, chi phi NVL va ton kho cuoi ky theo tung kho.
      </p>

      <PermissionGate
        session={mockSession}
        permission="report.view"
        fallback={<p className="rounded-md bg-red-50 p-4 text-sm text-red-700">Ban khong co quyen xem bao cao</p>}
      >
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tong hop thang {monthlySummary.month}</h2>
            <button
              type="button"
              aria-label="Tai ve bao cao thang"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
            >
              Tai ve
            </button>
          </div>
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-100 p-3">
              <dt className="text-xs uppercase text-slate-500">Gia tri nhap</dt>
              <dd className="text-lg font-semibold">{formatCurrency(monthlySummary.receiptAmount)}</dd>
            </div>
            <div className="rounded-md border border-slate-100 p-3">
              <dt className="text-xs uppercase text-slate-500">Gia tri xuat</dt>
              <dd className="text-lg font-semibold">{formatCurrency(monthlySummary.issueAmount)}</dd>
            </div>
            <div className="rounded-md border border-slate-100 p-3">
              <dt className="text-xs uppercase text-slate-500">Gia tri huy</dt>
              <dd className="text-lg font-semibold">{formatCurrency(monthlySummary.disposalAmount)}</dd>
            </div>
            <div className="rounded-md border border-slate-100 p-3">
              <dt className="text-xs uppercase text-slate-500">Ton cuoi ky</dt>
              <dd className="text-lg font-semibold">{formatCurrency(monthlySummary.endingInventoryAmount)}</dd>
            </div>
          </dl>
        </section>
      </PermissionGate>
    </main>
  )
}

export default ReportsPage
