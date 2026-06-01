'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import AppNavigation from './AppNavigation'
import HeaderUserMenu from './HeaderUserMenu'
import { apiClient } from '../lib/api'

const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const loggedIn = apiClient.isAuthenticated()
    if (!loggedIn && pathname !== '/login') {
      router.replace('/login')
      return
    }

    if (loggedIn && pathname === '/login') {
      router.replace('/dashboard')
      return
    }

    setReady(true)
  }, [pathname, router])

  if (!ready) {
    return <div className="min-h-screen bg-[var(--color-background)]" />
  }

  if (pathname === '/login') {
    return <div className="min-h-screen bg-[var(--color-background)]">{children}</div>
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b glass-surface bg-white/75 backdrop-blur-xl">
        <div className="app-shell py-3">
          <div className="glass-surface flex items-center justify-between gap-3 rounded-2xl border bg-white/70 px-3 py-2 shadow-sm md:px-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-bold text-white">
                TA
              </div>
              <div>
                <Link href="/dashboard" className="text-base font-semibold tracking-tight text-[var(--color-text)] md:text-lg">
                  TamAn Inventory Cloud
                </Link>
                <p className="muted-text text-xs">Quản trị kho vận thông minh</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="status-pill hidden bg-emerald-100 text-emerald-700 md:inline-flex">Hệ thống hoạt động</span>
              <AppNavigation />
              <HeaderUserMenu />
            </div>
          </div>
        </div>
      </header>

      <div className="relative pb-20 md:pb-8">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
          <div className="absolute left-[-120px] top-16 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="absolute right-[-120px] top-24 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
        </div>
        {children}
      </div>
    </>
  )
}

export default AppShell
