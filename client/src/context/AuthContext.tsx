import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import type { User } from '../types'
import { authApi } from '../api/endpoints'
import { ApiClientError, setUnauthorizedHandler } from '../api/client'
import { logNonCriticalError } from '../utils/errors'

interface AuthContextValue {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me()
      setUser(me)
    } catch (error) {
      // 401/403 simply means "not signed in"; anything else (server down,
      // unreadable response) is a real problem worth surfacing in the console
      // rather than being indistinguishable from a logged-out visitor.
      if (!(error instanceof ApiClientError) || error.status >= 500 || error.status === 0) {
        logNonCriticalError('auth:refresh', error)
      }
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    setUnauthorizedHandler(() => setUser(null))
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (error) {
      // The local session is dropped either way, but a failed server-side
      // logout (token not revoked) must not go unnoticed.
      logNonCriticalError('auth:logout', error)
    }
    setUser(null)
    window.location.assign('/login')
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
