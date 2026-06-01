import { apiClient, formatCurrencyVnd } from '../../lib/api'

const DashboardPage = async () => {
  const dashboard = await apiClient.getDashboard()
  const quickHighlights = [
    { label: 'Lệch sản lượng TP', value: `${dashboard.productionVarianceAlerts.length} lệnh` },
    { label: 'Số giao dịch', value: `${dashboard.movementCount}` },
    { label: 'Kho theo dõi', value: 'WH-DEMO' }
  ]

  const kpis = [
    { title: 'Giá trị nhập', value: formatCurrencyVnd(dashboard.totalReceipt), trend: 'Dữ liệu thời gian thực' },
    { title: 'Giá trị xuất', value: formatCurrencyVnd(dashboard.totalIssue), trend: 'Dữ liệu thời gian thực' },
    { title: 'Giá trị huỷ', value: formatCurrencyVnd(dashboard.totalDisposal), trend: 'Dữ liệu thời gian thực' },
    { title: 'Số giao dịch', value: `${dashboard.movementCount}`, trend: 'Dữ liệu thời gian thực' }
  ]

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-blue-950 to-cyan-900 p-4 text-white shadow-xl md:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 left-6 h-28 w-28 rounded-full bg-indigo-300/30 blur-3xl" />
        <h1 className="text-xl font-semibold md:text-3xl">Bảng điều khiển tổng quan</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-200 md:text-base">
          Tổng hợp KPI tồn kho, cảnh báo, chi phí nguyên vật liệu và xu hướng vận hành theo thời gian thực.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {quickHighlights.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-cyan-100">{item.label}</p>
              <p className="mt-1 text-sm font-semibold md:text-base">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article
            key={kpi.title}
            tabIndex={0}
            aria-label={`KPI ${kpi.title}`}
            className="surface-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">{kpi.title}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)] md:text-3xl">{kpi.value}</p>
            <p className="mt-1 text-sm font-medium text-blue-600">{kpi.trend}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="surface-card p-4">
          <h2 className="text-base font-semibold md:text-lg">Cảnh báo cần xử lý</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {dashboard.productionVarianceAlerts.map((alert) => (
              <li key={alert.orderId} className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="font-semibold">
                  {alert.orderNo} - {alert.finishedGoodCode} {alert.finishedGoodName}
                </p>
                <p>Kế hoạch: {alert.plannedQty} | Thực tế: {alert.actualQty} | Lệch: {alert.varianceQty}</p>
                <p>Lý do: {alert.reason}</p>
              </li>
            ))}
            {dashboard.productionVarianceAlerts.length === 0 && (
              <li className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                Không có lệnh thành phẩm lệch sản lượng so với kế hoạch
              </li>
            )}
          </ul>
        </article>
        <article className="surface-card p-4">
          <h2 className="text-base font-semibold md:text-lg">Hiệu suất vận hành</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <p className="text-slate-500">Tỷ lệ đúng BOM</p>
              <p className="mt-1 text-lg font-semibold">98.7%</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <p className="text-slate-500">Thời gian chu kỳ</p>
              <p className="mt-1 text-lg font-semibold">2.4 ngày</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}

export default DashboardPage
