'use client'

import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark'

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem('theme-mode')
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const ThemeToggle = () => {
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const resolvedTheme = getInitialTheme()
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    setTheme(resolvedTheme)
    setMounted(true)
  }, [])

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    window.localStorage.setItem('theme-mode', nextTheme)
  }

  if (!mounted) {
    return null
  }

  return (
    <button
      type="button"
      onClick={handleToggleTheme}
      aria-label="Chuyển giao diện sáng tối"
      className="rounded-xl border border-slate-300/50 bg-white/80 px-2.5 py-2 text-xs font-semibold text-[var(--color-text)] shadow-sm hover:bg-white"
    >
      {theme === 'light' ? '🌙 Tối' : '☀️ Sáng'}
    </button>
  )
}

export default ThemeToggle
