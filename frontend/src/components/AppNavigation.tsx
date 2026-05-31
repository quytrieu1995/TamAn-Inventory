'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
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
