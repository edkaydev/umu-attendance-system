import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import type { User } from '../types'
import { authApi } from '../api/endpoints'
import { setUnauthorizedHandler } from '../api/client'

interface AuthContextValue {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
  /** Patch the cached user locally (e.g. after tour completion) without a server round-trip. */
  updateUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
  updateUser: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me()
      setUser(me)
    } catch {
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
    } catch {
      // ignore — cookies cleared client side regardless
    }
    setUser(null)
    window.location.assign('/login')
  }, [])

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((u) => (u ? { ...u, ...patch } : u))
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
