'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiClient, formatCurrencyVnd, type InventoryDetailReport, type MaterialPriceTrendReport, type MonthlySummary } from '../../lib/api'
import TablePageSizeControl from '../../components/TablePageSizeControl'

const toMonthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
const toDateKey = (date: Date) => date.toISOString().slice(0, 10)

const buildDefaultRange = (periodType: 'week' | 'month') => {
  const today = new Date()
  if (periodType === 'month') {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1))
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
    return { fromDate: toDateKey(start), toDate: toDateKey(end) }
  }

  const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000 * 11)
  return { fromDate: toDateKey(start), toDate: toDateKey(today) }
}

type ReportTab = 'MONTHLY_SUMMARY' | 'MATERIAL_PRICE_TREND' | 'MATERIAL_INVENTORY_DETAIL' | 'FINISHED_GOOD_INVENTORY_DETAIL'

const REPORT_TABS: Array<{ id: ReportTab, label: string }> = [
  { id: 'MONTHLY_SUMMARY', label: 'Tổng hợp tháng' },
  { id: 'MATERIAL_PRICE_TREND', label: 'Giá nhập NVL' },
  { id: 'MATERIAL_INVENTORY_DETAIL', label: 'NXT chi tiết NVL' },
  { id: 'FINISHED_GOOD_INVENTORY_DETAIL', label: 'NXT chi tiết TP' }
]

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('MONTHLY_SUMMARY')
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()))
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null)
  const [inventoryDetail, setInventoryDetail] = useState<InventoryDetailReport | null>(null)
  const [pricePeriodType, setPricePeriodType] = useState<'week' | 'month'>('month')
  const [fromDate, setFromDate] = useState(() => buildDefaultRange('month').fromDate)
  const [toDate, setToDate] = useState(() => buildDefaultRange('month').toDate)
  const [priceTrendReport, setPriceTrendReport] = useState<MaterialPriceTrendReport | null>(null)
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [tablePageSize, setTablePageSize] = useState<10 | 20 | 50>(10)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadMonthlyBlocks = async (nextMonthKey: string) => {
    const [summary, detail] = await Promise.all([
      apiClient.getMonthlySummary(nextMonthKey),
      apiClient.getInventoryDetailReport(nextMonthKey)
    ])
    setFeedback(null)
    setMonthlySummary(summary)
    setInventoryDetail(detail)
  }

  const loadPriceTrend = async (periodType: 'week' | 'month', nextFromDate: string, nextToDate: string) => {
    if (nextFromDate > nextToDate) {
      setFeedback('Khoảng thời gian không hợp lệ: ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc')
      setPriceTrendReport(null)
      return
    }

    const report = await apiClient.getMaterialPriceTrendReport({
      periodType,
      fromDate: nextFromDate,
      toDate: nextToDate
    })
    setFeedback(null)
    setPriceTrendReport(report)
    if (!selectedMaterialId && report.materials.length > 0) {
      setSelectedMaterialId(report.materials[0].materialId)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadMonthlyBlocks(monthKey)
      .catch((error) => {
        setFeedback(error instanceof Error ? error.message : 'Không thể tải báo cáo tháng')
      })
      .finally(() => setLoading(false))
  }, [monthKey])

  useEffect(() => {
    setLoading(true)
    loadPriceTrend(pricePeriodType, fromDate, toDate)
      .catch((error) => {
        setFeedback(error instanceof Error ? error.message : 'Không thể tải báo cáo xu hướng giá nhập')
      })
      .finally(() => setLoading(false))
  }, [pricePeriodType, fromDate, toDate])

  const selectedSeries = useMemo(() => {
    if (!priceTrendReport) {
      return null
    }
    return priceTrendReport.materials.find((material) => material.materialId === selectedMaterialId) ?? null
  }, [priceTrendReport, selectedMaterialId])

  const chartPoints = useMemo(() => {
    if (!selectedSeries || selectedSeries.points.length === 0) {
      return ''
    }

    const width = 640
    const height = 220
    const padding = 32
    const values = selectedSeries.points.map((point) => point.avgUnitPrice)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    return selectedSeries.points.map((point, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(selectedSeries.points.length - 1, 1)
      const y = height - padding - ((point.avgUnitPrice - min) / span) * (height - padding * 2)
      return `${x},${y}`
    }).join(' ')
  }, [selectedSeries])

  const visibleMaterialRows = useMemo(() => {
    return inventoryDetail?.materials.slice(0, tablePageSize) ?? []
  }, [inventoryDetail?.materials, tablePageSize])

  const visibleFinishedGoodRows = useMemo(() => {
    return inventoryDetail?.finishedGoods.slice(0, tablePageSize) ?? []
  }, [inventoryDetail?.finishedGoods, tablePageSize])

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div>
        <h1 className="text-xl font-semibold md:text-3xl">Báo cáo</h1>
        <p className="muted-text text-sm md:text-base">
          Theo dõi báo cáo nhập xuất tồn và xu hướng giá nhập nguyên vật liệu theo tuần/tháng.
        </p>
      </div>

      {feedback && <p className="text-sm text-rose-600">{feedback}</p>}

      <section className="surface-card p-2">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-label={`Chon tab ${tab.label}`}
              aria-pressed={activeTab === tab.id}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {loading && <p className="text-xs text-slate-500">Đang tải dữ liệu báo cáo...</p>}

      {activeTab === 'MONTHLY_SUMMARY' && (
      <section className="surface-card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span>Kỳ báo cáo tháng</span>
            <input
              type="month"
              className="mt-1 rounded-lg border border-slate-200 bg-white p-2"
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value)}
            />
          </label>
        </div>

        {monthlySummary && (
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
        )}
      </section>
      )}

      {activeTab === 'MATERIAL_PRICE_TREND' && (
      <section className="surface-card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span>Chu kỳ</span>
            <select
              className="mt-1 rounded-lg border border-slate-200 bg-white p-2"
              value={pricePeriodType}
              onChange={(event) => {
                const nextType = event.target.value as 'week' | 'month'
                setPricePeriodType(nextType)
                const nextRange = buildDefaultRange(nextType)
                setFromDate(nextRange.fromDate)
                setToDate(nextRange.toDate)
              }}
            >
              <option value="week">Theo tuần</option>
              <option value="month">Theo tháng</option>
            </select>
          </label>
          <label className="text-sm">
            <span>Từ ngày</span>
            <input
              type="date"
              className="mt-1 rounded-lg border border-slate-200 bg-white p-2"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span>Đến ngày</span>
            <input
              type="date"
              className="mt-1 rounded-lg border border-slate-200 bg-white p-2"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span>Nguyên liệu</span>
            <select
              className="mt-1 rounded-lg border border-slate-200 bg-white p-2"
              value={selectedMaterialId}
              onChange={(event) => setSelectedMaterialId(event.target.value)}
            >
              {priceTrendReport?.materials.map((material) => (
                <option key={material.materialId} value={material.materialId}>
                  {material.code} - {material.name}
                </option>
              ))}
              {!priceTrendReport?.materials.length && <option value="">Không có dữ liệu</option>}
            </select>
          </label>
        </div>

        <h2 className="mb-2 text-lg font-semibold">Xu hướng giá nhập nguyên vật liệu</h2>
        {selectedSeries && selectedSeries.points.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm text-slate-600">
              {selectedSeries.code} - {selectedSeries.name}
            </p>
            <svg viewBox="0 0 640 220" className="h-56 w-full">
              <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={chartPoints} />
              {selectedSeries.points.map((point, index) => {
                const width = 640
                const height = 220
                const padding = 32
                const values = selectedSeries.points.map((value) => value.avgUnitPrice)
                const min = Math.min(...values)
                const max = Math.max(...values)
                const span = max - min || 1
                const x = padding + (index * (width - padding * 2)) / Math.max(selectedSeries.points.length - 1, 1)
                const y = height - padding - ((point.avgUnitPrice - min) / span) * (height - padding * 2)
                return <circle key={point.periodKey} cx={x} cy={y} r="4" fill="#0f172a" />
              })}
            </svg>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              {selectedSeries.points.map((point) => (
                <div key={`label-${point.periodKey}`} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
                  <p className="font-semibold">{point.periodKey}</p>
                  <p>Giá TB: {formatCurrencyVnd(point.avgUnitPrice)}</p>
                  <p>Biên độ: {formatCurrencyVnd(point.minUnitPrice)} - {formatCurrencyVnd(point.maxUnitPrice)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {(!selectedSeries || selectedSeries.points.length === 0) && (
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
            Chưa có dữ liệu giá nhập trong khoảng thời gian đã chọn.
          </p>
        )}
      </section>
      )}

      {activeTab === 'MATERIAL_INVENTORY_DETAIL' && inventoryDetail && (
          <section className="surface-card p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Báo cáo nhập - xuất - tồn chi tiết nguyên liệu</h2>
              <p className="text-sm text-slate-500">Theo kỳ {inventoryDetail.monthKey}, chi tiết cho từng mã nguyên liệu</p>
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
                    <th className="px-3 py-2 text-right">Nhập kỳ</th>
                    <th className="px-3 py-2 text-right">Xuất kỳ</th>
                    <th className="px-3 py-2 text-right">Hủy kỳ</th>
                    <th className="px-3 py-2 text-right">Tồn hiện tại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleMaterialRows.map((row) => (
                    <tr key={row.materialId} className="bg-white">
                      <td className="px-3 py-2 font-medium">{row.code}</td>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.uom}</td>
                      <td className="px-3 py-2 text-right">{row.periodReceiptQty}</td>
                      <td className="px-3 py-2 text-right">{row.periodIssueQty}</td>
                      <td className="px-3 py-2 text-right">{row.periodDisposalQty}</td>
                      <td className="px-3 py-2 text-right font-semibold">{row.onHandQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
      )}

      {activeTab === 'FINISHED_GOOD_INVENTORY_DETAIL' && inventoryDetail && (
          <section className="surface-card p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Báo cáo nhập - xuất - tồn chi tiết thành phẩm</h2>
              <p className="text-sm text-slate-500">Theo kỳ {inventoryDetail.monthKey}, chi tiết cho từng mã thành phẩm</p>
            </div>
            <div className="mb-3">
              <TablePageSizeControl value={tablePageSize} onChange={setTablePageSize} />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Mã TP</th>
                    <th className="px-3 py-2">Tên TP</th>
                    <th className="px-3 py-2">ĐVT</th>
                    <th className="px-3 py-2 text-right">Nhập kỳ</th>
                    <th className="px-3 py-2 text-right">Xuất kỳ</th>
                    <th className="px-3 py-2 text-right">Tồn hiện tại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleFinishedGoodRows.map((row) => (
                    <tr key={row.finishedGoodId} className="bg-white">
                      <td className="px-3 py-2 font-medium">{row.code}</td>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.uom}</td>
                      <td className="px-3 py-2 text-right">{row.periodReceiptQty}</td>
                      <td className="px-3 py-2 text-right">{row.periodIssueQty}</td>
                      <td className="px-3 py-2 text-right font-semibold">{row.onHandQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
      )}
    </main>
  )
}

export default ReportsPage
