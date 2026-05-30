const kpis = [
  { title: 'Gia tri ton kho', value: '2.48 ty', trend: '+4.2%' },
  { title: 'Ty le huy', value: '1.8%', trend: '-0.4%' },
  { title: 'Chi phi NVL thang', value: '1.12 ty', trend: '+2.1%' },
  { title: 'Canh bao mo', value: '9', trend: '+3' }
]

const DashboardPage = () => {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <section>
        <h1 className="text-2xl font-semibold">Dashboard tong quan</h1>
        <p className="text-sm text-slate-600">
          Tong hop KPI ton kho, canh bao, chi phi NVL va xu huong van hanh theo nha may.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article
            key={kpi.title}
            tabIndex={0}
            aria-label={`KPI ${kpi.title}`}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{kpi.value}</p>
            <p className="mt-1 text-sm text-slate-600">{kpi.trend}</p>
          </article>
        ))}
      </section>
    </main>
  )
}

export default DashboardPage
