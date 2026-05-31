'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../lib/api'
import { useSession } from '../hooks/use-session'

type ThemeMode = 'light' | 'dark'

const getCurrentTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const storedTheme = window.localStorage.getItem('theme-mode')
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

const HeaderUserMenu = () => {
  const router = useRouter()
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>('light')
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canManageUser = session?.permissions.includes('user.manage') ?? false

  useEffect(() => {
    setTheme(getCurrentTheme())
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!wrapperRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    window.localStorage.setItem('theme-mode', nextTheme)
  }

  const handleLogout = () => {
    apiClient.logout()
    router.replace('/login')
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-label="Mở menu tài khoản"
        className="grid h-9 w-9 place-items-center rounded-xl border border-slate-300 bg-white text-sm hover:bg-slate-50"
      >
        ⚙️
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">{session?.profile?.fullName || 'Người dùng'}</p>
            <p>{session?.profile?.email || '-'}</p>
          </div>

          <button
            type="button"
            onClick={handleToggleTheme}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            {theme === 'light' ? '🌙 Chuyển sang giao diện tối' : '☀️ Chuyển sang giao diện sáng'}
          </button>

          {canManageUser && (
            <Link
              href="/users"
              onClick={() => setOpen(false)}
              className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Người dùng
            </Link>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 w-full rounded-lg border border-rose-200 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

export default HeaderUserMenu
