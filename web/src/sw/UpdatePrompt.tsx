import { useEffect, useState } from 'react'
import { bindUpdatePrompt, type UpdateRegistration } from './updates'
import './update.css'

/** "Update ready, reload" once a new service worker is waiting. Hidden until then. */
export function ServiceWorkerUpdate({
  registration,
  hasController,
  onReload,
}: {
  registration: UpdateRegistration | null
  hasController: () => boolean
  onReload: () => void
}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (registration == null) return
    return bindUpdatePrompt(registration, hasController, () => setReady(true))
  }, [registration, hasController])

  if (!ready) return null

  return (
    <div className="update-ready">
      <button type="button" onClick={onReload}>
        Update ready, reload
      </button>
    </div>
  )
}
