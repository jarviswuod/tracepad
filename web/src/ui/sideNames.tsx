import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type SideNames = {
  /** True while side-list names sit next to the icons. */
  open: boolean
  toggle: () => void
}

const SideNamesContext = createContext<SideNames | null>(null)

/** Shares the hamburger state between the top bar and the side list. */
export function SideNamesProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const toggle = useCallback(() => setOpen((value) => !value), [])
  const value = useMemo(() => ({ open, toggle }), [open, toggle])
  return <SideNamesContext.Provider value={value}>{children}</SideNamesContext.Provider>
}

/** Names start visible. Without a provider the toggle does nothing. */
export function useSideNames(): SideNames {
  const value = useContext(SideNamesContext)
  if (value) return value
  return { open: true, toggle: () => {} }
}
