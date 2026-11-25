import { useEffect, useState } from 'react'
import { openTracepadDb, type TracepadDatabase } from '../data/db'
import { startupLocalCleanup } from '../data/notes'
import { ReminderRuntime } from '../features/reminders/ReminderRuntime'
import { SearchControls } from '../features/search/SearchControls'
import { AppRoutes } from './AppRoutes'
import './app.css'

/** The title and the search box, on one line, on every page. */
export function AppHeader() {
  return (
    <header className="top-bar">
      <h1>Tracepad</h1>
      <SearchControls />
    </header>
  )
}

export function AppShell() {
  const [db, setDb] = useState<TracepadDatabase | null>(null)

  useEffect(() => {
    let active = true
    void openTracepadDb()
      .then(async (opened) => {
        await startupLocalCleanup(opened)
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
      <AppHeader />
      {db ? <ReminderRuntime db={db} /> : null}
      {db ? <AppRoutes db={db} /> : null}
    </main>
  )
}
