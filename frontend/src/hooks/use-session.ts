'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiClient, type SessionInfo } from '../lib/api'

type UseSessionState = {
  session: SessionInfo | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export const useSession = (): UseSessionState => {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.getSession()
      setSession(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải phiên đăng nhập')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  return {
    session,
    loading,
    error,
    reload: load
  }
}
