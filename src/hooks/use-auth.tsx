import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'

interface AuthContextType {
  user: { id: string; email: string; name: string } | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  signIn: async () => {},
  signOut: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextType['user']>(null)

  useEffect(() => {
    const m = pb.authStore.record as unknown as {
      id?: string
      email?: string
      name?: string
    } | null
    if (m?.id) setUser({ id: m.id, email: m.email ?? '', name: m.name ?? '' })
    const unsub = pb.authStore.onChange(() => {
      const r = pb.authStore.record as unknown as {
        id?: string
        email?: string
        name?: string
      } | null
      setUser(r?.id ? { id: r.id, email: r.email ?? '', name: r.name ?? '' } : null)
    })
    return unsub
  }, [])

  const signIn = async (email: string, password: string) => {
    await pb.collection('users').authWithPassword(email, password)
  }
  const signOut = () => {
    pb.authStore.clear()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
