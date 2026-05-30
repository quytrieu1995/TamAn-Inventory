import { apiClient, formatCurrencyVnd } from '../../lib/api'

const ReportsPage = async () => {
  const monthlySummary = await apiClient.getMonthlySummary('2026-05')

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div>
        <h1 className="text-xl font-semibold md:text-3xl">Báo cáo tháng</h1>
        <p className="muted-text text-sm md:text-base">
          Báo cáo xuất, nhập, huỷ, chi phí NVL và tồn kho cuối kỳ theo từng kho.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="surface-card p-4">
          <p className="text-xs uppercase text-slate-500">Kỳ báo cáo</p>
          <p className="mt-1 text-lg font-semibold">{monthlySummary.monthKey}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase text-slate-500">Kho</p>
          <p className="mt-1 text-lg font-semibold">WH-DEMO</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase text-slate-500">Trạng thái</p>
          <p className="status-pill mt-1 bg-emerald-100 text-emerald-700">Synced</p>
        </article>
      </section>

      <section className="surface-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tổng hợp tháng {monthlySummary.monthKey}</h2>
          <button
            type="button"
            aria-label="Tai ve bao cao thang"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Tải về
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <dt className="text-xs uppercase text-slate-500">Giá trị nhập</dt>
            <dd className="text-lg font-semibold">{formatCurrencyVnd(monthlySummary.totalReceiptAmount)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <dt className="text-xs uppercase text-slate-500">Giá trị xuất</dt>
            <dd className="text-lg font-semibold">{formatCurrencyVnd(monthlySummary.totalIssueAmount)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <dt className="text-xs uppercase text-slate-500">Giá trị huỷ</dt>
            <dd className="text-lg font-semibold">{formatCurrencyVnd(monthlySummary.totalDisposalAmount)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <dt className="text-xs uppercase text-slate-500">Tồn cuối kỳ</dt>
            <dd className="text-lg font-semibold">{formatCurrencyVnd(monthlySummary.endingInventoryAmount)}</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}

export default ReportsPage
