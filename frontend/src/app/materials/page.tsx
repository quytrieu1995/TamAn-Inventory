const materialRows = [
  { code: 'SUGAR001', name: 'Duong tinh luyen', batchNo: 'B-240501', quantity: 180, min: 200, ageDays: 22 },
  { code: 'FLOUR001', name: 'Bot mi so 8', batchNo: 'B-240518', quantity: 540, min: 300, ageDays: 5 },
  { code: 'BUTTER001', name: 'Bo lat', batchNo: 'B-240430', quantity: 90, min: 120, ageDays: 28 }
]

const MaterialsPage = () => {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Quan ly nguyen vat lieu</h1>
        <p className="text-sm text-slate-600">
          Theo doi ton theo lo, canh bao ton thap va luu kho qua nguong cho tung kho.
        </p>
      </header>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Ma NVL</th>
              <th className="px-4 py-3">Ten NVL</th>
              <th className="px-4 py-3">Lo</th>
              <th className="px-4 py-3 text-right">Ton hien tai</th>
              <th className="px-4 py-3 text-right">Ton toi thieu</th>
              <th className="px-4 py-3 text-right">So ngay luu kho</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materialRows.map((row) => (
              <tr key={`${row.code}-${row.batchNo}`} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{row.code}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{row.batchNo}</td>
                <td className="px-4 py-3 text-right">{row.quantity}</td>
                <td className="px-4 py-3 text-right">{row.min}</td>
                <td className="px-4 py-3 text-right">{row.ageDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

export default MaterialsPage
