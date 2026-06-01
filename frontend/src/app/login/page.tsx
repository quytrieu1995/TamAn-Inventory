'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '../../lib/api'

const LoginPage = () => {
  const router = useRouter()
  const [email, setEmail] = useState('admin@taman.local')
  const [password, setPassword] = useState('123456')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await authClient.login(email, password)
      router.replace('/dashboard')
    } catch (loginError) {
      authClient.logout()
      setError(loginError instanceof Error ? loginError.message : 'Không thể đăng nhập')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-shell flex min-h-screen items-center justify-center py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Đăng nhập hệ thống</h1>
        <p className="mt-1 text-sm text-slate-500">Đăng nhập bằng email và mật khẩu</p>

        <form onSubmit={handleLogin} className="mt-5 grid grid-cols-1 gap-3">
          <label className="text-sm">
            <span>Email</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span>Mật khẩu</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Tài khoản demo mặc định: admin@taman.local / 123456
        </p>
      </section>
    </main>
  )
}

export default LoginPage
