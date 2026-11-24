import { useEffect, useState } from 'react'
import { openTracepadDb, type TracepadDatabase } from '../data/db'
import { recoverLeftoverDrafts } from '../data/notes'
import { AppRoutes } from './AppRoutes'

export function AppShell() {
  const [db, setDb] = useState<TracepadDatabase | null>(null)

  useEffect(() => {
    let active = true
    void openTracepadDb()
      .then(async (opened) => {
        await recoverLeftoverDrafts(opened)
        if (active) setDb(opened)
      })
      .catch(() => {
        // The heading still shows. Notes need the local database.
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <main>
      <h1>Tracepad</h1>
      {db ? <AppRoutes db={db} /> : null}
    </main>
  )
}
