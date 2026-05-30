const orders = [
  { orderNo: 'PO-2026-0012', product: 'Banh quy bo', planned: 1200, actual: 1180, status: 'COMPLETED' },
  { orderNo: 'PO-2026-0013', product: 'Banh gao', planned: 900, actual: 0, status: 'RELEASED' },
  { orderNo: 'PO-2026-0014', product: 'Snack khoai tay', planned: 1500, actual: 0, status: 'IN_PROGRESS' }
]

const FinishedGoodsPage = () => {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Thanh pham va san xuat</h1>
          <p className="text-sm text-slate-600">
            Theo doi lenh san xuat, consume NVL theo BOM va ket qua nhap kho thanh pham.
          </p>
        </div>
        <button
          type="button"
          aria-label="Tao lenh san xuat moi"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Tao lenh moi
        </button>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <ul className="space-y-2">
          {orders.map((order) => (
            <li
              key={order.orderNo}
              tabIndex={0}
              aria-label={`Lenh ${order.orderNo}`}
              className="grid grid-cols-5 items-center gap-3 rounded-md border border-slate-100 px-3 py-2 text-sm"
            >
              <span className="font-medium">{order.orderNo}</span>
              <span>{order.product}</span>
              <span className="text-right">{order.planned}</span>
              <span className="text-right">{order.actual}</span>
              <span className="text-right font-medium">{order.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default FinishedGoodsPage
