import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { openTracepadDb, type TracepadDatabase } from '../data/db'
import { startupLocalCleanup } from '../data/notes'
import { barTitle, showsBrandMark } from '../features/board/viewPath'
import { ReminderRuntime } from '../features/reminders/ReminderRuntime'
import { SearchControls } from '../features/search/SearchControls'
import { reloadForUpdate, watchAppShell } from '../sw/register'
import { ServiceWorkerUpdate } from '../sw/UpdatePrompt'
import type { UpdateRegistration } from '../sw/updates'
import { Icon } from '../ui/icons'
import { SideNamesProvider, useSideNames } from '../ui/sideNames'
import { AppRoutes } from './AppRoutes'
import './app.css'

/** The menu button, the open view's name, and the search box, on one line. */
export function AppHeader() {
  const { pathname } = useLocation()
  const { open, toggle } = useSideNames()
  const title = barTitle(pathname)
  return (
    <header className="top-bar">
      <button
        type="button"
        className="main-menu"
        aria-label="Main menu"
        title="Main menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="menu" />
      </button>
      <h1>
        {showsBrandMark(pathname) ? (
          <span className="brand-bulb">
            <Icon name="bulb" />
          </span>
        ) : null}
        <span className="top-bar-title">{title}</span>
      </h1>
      <SearchControls />
    </header>
  )
}

export function AppShell() {
  const [db, setDb] = useState<TracepadDatabase | null>(null)
  const [registration, setRegistration] = useState<UpdateRegistration | null>(null)
  const hasController = useCallback(
    () => 'serviceWorker' in navigator && navigator.serviceWorker.controller != null,
    [],
  )

  useEffect(() => watchAppShell(setRegistration), [])

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
    <SideNamesProvider>
      <main>
        <ServiceWorkerUpdate
          registration={registration}
          hasController={hasController}
          onReload={reloadForUpdate}
        />
        <AppHeader />
        {db ? <ReminderRuntime db={db} /> : null}
        {db ? <AppRoutes db={db} /> : null}
      </main>
    </SideNamesProvider>
  )
}
