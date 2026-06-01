'use client'

import { useRouter } from 'next/navigation'
import { apiClient } from '../lib/api'
import { useSession } from '../hooks/use-session'

const AuthActions = () => {
  const router = useRouter()
  const { session } = useSession()

  const handleLogout = () => {
    apiClient.logout()
    router.replace('/login')
  }

  return (
    <div className="flex items-center gap-2">
      {session?.profile?.fullName && (
        <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 md:inline-flex">
          {session.profile.fullName}
        </span>
      )}
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Logout
      </button>
    </div>
  )
}

export default AuthActions
