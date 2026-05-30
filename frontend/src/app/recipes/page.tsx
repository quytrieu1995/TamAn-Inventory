import PermissionGate from '../../components/PermissionGate'
import { hasPermission, mockSession } from '../../lib/auth'

const mockRecipe = {
  code: 'FG-COOKIE-001',
  name: 'Banh quy bo',
  versionNo: 3,
  items: [
    { materialCode: 'SUGAR001', qtyPerUnit: 0.125 },
    { materialCode: 'FLOUR001', qtyPerUnit: 0.233 },
    { materialCode: 'BUTTER001', qtyPerUnit: 0.078 }
  ]
}

const RecipesPage = () => {
  const canManageRecipe = hasPermission(mockSession, 'recipe.manage')

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bao mat cong thuc va BOM</h1>
          <p className="text-sm text-slate-600">
            Quyen xem va quyen chinh sua cong thuc duoc tach rieng tai backend va frontend.
          </p>
        </div>
        <button
          type="button"
          aria-label="Them cong thuc moi"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!canManageRecipe}
        >
          Them cong thuc
        </button>
      </header>

      <PermissionGate
        session={mockSession}
        permission="recipe.view"
        fallback={
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Ban khong co quyen xem cong thuc
          </section>
        }
      >
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{mockRecipe.name}</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
              {mockRecipe.code} - v{mockRecipe.versionNo}
            </span>
          </div>

          <ul className="space-y-2">
            {mockRecipe.items.map((item) => (
              <li
                key={item.materialCode}
                tabIndex={0}
                aria-label={`Nguyen lieu ${item.materialCode}`}
                className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="font-medium">{item.materialCode}</span>
                <span>
                  {canManageRecipe ? `${item.qtyPerUnit.toFixed(3)} kg` : `${item.qtyPerUnit.toFixed(2)} kg`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </PermissionGate>
    </main>
  )
}

export default RecipesPage
