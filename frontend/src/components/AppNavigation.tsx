'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from '../hooks/use-session'

const navItems = [
  { href: '/dashboard', label: 'Tổng quan', requiredPermission: null },
  { href: '/suppliers', label: 'Nhà cung cấp', requiredPermission: 'supplier.manage' },
  { href: '/materials', label: 'Nguyên liệu', requiredPermission: null },
  { href: '/finished-goods', label: 'Sản xuất', requiredPermission: null },
  { href: '/recipes', label: 'Công thức', requiredPermission: 'recipe.view' },
  { href: '/reports', label: 'Báo cáo', requiredPermission: 'report.view' }
] as const

const getLinkClassName = (isActive: boolean) => {
  if (isActive) {
    return 'rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-xs font-semibold text-white shadow-sm md:text-sm'
  }

  return 'rounded-full px-3 py-2 text-xs font-medium text-[var(--color-muted)] hover:bg-white/70 hover:text-[var(--color-text)] md:text-sm'
}

const AppNavigation = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { session } = useSession()
  const visibleNavItems = navItems.filter((item) => {
    if (!item.requiredPermission) {
      return true
    }

    return session?.permissions.includes(item.requiredPermission) ?? false
  })

  return (
    <>
      <nav aria-label="Điều hướng desktop" className="hidden items-center gap-2 md:flex">
        {visibleNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          if (item.href === '/materials') {
            const materialView = searchParams.get('view')
            const warehouseActive = materialView !== 'catalog'
            const catalogActive = materialView === 'catalog'

            return (
              <div key={item.href} className="group relative">
                <Link href="/materials?view=warehouse" className={getLinkClassName(isActive)}>
                  {item.label}
                </Link>
                <div className="invisible absolute left-0 top-10 z-50 w-72 rounded-xl border border-slate-200 bg-white p-2 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100">
                  <Link
                    href="/materials?view=warehouse"
                    className={`block rounded-lg border px-3 py-2 text-sm ${warehouseActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    Quản lý kho nguyên vật liệu
                  </Link>
                  <Link
                    href="/materials?view=catalog"
                    className={`mt-2 block rounded-lg border px-3 py-2 text-sm ${catalogActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    Danh sách nguyên vật liệu
                  </Link>
                </div>
              </div>
            )
          }

          if (item.href === '/finished-goods') {
            const finishedGoodsView = searchParams.get('view')
            const inventoryActive = finishedGoodsView !== 'orders' && finishedGoodsView !== 'issues'
            const ordersActive = finishedGoodsView === 'orders'
            const issuesActive = finishedGoodsView === 'issues'

            return (
              <div key={item.href} className="group relative">
                <Link href="/finished-goods?view=inventory" className={getLinkClassName(isActive)}>
                  {item.label}
                </Link>
                <div className="invisible absolute left-0 top-10 z-50 w-72 rounded-xl border border-slate-200 bg-white p-2 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100">
                  <Link
                    href="/finished-goods?view=inventory"
                    className={`block rounded-lg border px-3 py-2 text-sm ${inventoryActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    Quản lý kho thành phẩm
                  </Link>
                  <Link
                    href="/finished-goods?view=orders"
                    className={`mt-2 block rounded-lg border px-3 py-2 text-sm ${ordersActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    Tạo lệnh sản xuất
                  </Link>
                  <Link
                    href="/finished-goods?view=issues"
                    className={`mt-2 block rounded-lg border px-3 py-2 text-sm ${issuesActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    Xuất kho thành phẩm
                  </Link>
                </div>
              </div>
            )
          }

          return (
            <Link key={item.href} href={item.href} className={getLinkClassName(isActive)}>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <nav
        aria-label="Điều hướng di động"
        className="glass-surface fixed inset-x-0 bottom-0 z-40 border-t bg-white/80 p-2 backdrop-blur-xl md:hidden"
      >
        <div className="glass-surface mx-auto grid w-full max-w-2xl grid-cols-3 gap-1 rounded-2xl border bg-white/70 p-1 shadow-sm">
          {visibleNavItems.slice(0, 6).map((item) => {
            const href = item.href === '/materials'
              ? '/materials?view=warehouse'
              : item.href === '/finished-goods'
                ? '/finished-goods?view=inventory'
                : item.href
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={href}
                className={`rounded-xl px-2 py-2 text-center text-[11px] font-medium ${
                  isActive ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

export default AppNavigation
