import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import AppNavigation from '../components/AppNavigation'
import ThemeToggle from '../components/ThemeToggle'
import './globals.css'

export const metadata: Metadata = {
  title: 'TamAn Inventory',
  description: 'Nền tảng quản lý tồn kho, sản xuất và báo cáo cho TamAn'
}

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
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
              <div className="flex items-center gap-2">
                <span className="status-pill hidden bg-emerald-100 text-emerald-700 md:inline-flex">Hệ thống hoạt động</span>
                <ThemeToggle />
              </div>
              <AppNavigation />
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
      </body>
    </html>
  )
}

export default RootLayout
