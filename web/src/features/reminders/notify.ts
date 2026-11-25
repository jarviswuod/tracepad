// Notification permission. Tracepad asks once, with an explanation, then shows
// an in-app banner if notifications stay blocked.

export const NOTIFICATION_ASKED_KEY = 'tracepad.notificationsAsked'

export type NotificationAccess = NotificationPermission | 'unsupported'

export function notificationPermission(): NotificationAccess {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export function wasNotificationAsked(): boolean {
  try {
    return localStorage.getItem(NOTIFICATION_ASKED_KEY) === '1'
  } catch {
    return false
  }
}

/** Remember the ask, then request permission. A later open does not ask again. */
export async function askForNotifications(): Promise<NotificationAccess> {
  try {
    localStorage.setItem(NOTIFICATION_ASKED_KEY, '1')
  } catch {
    // A blocked store still allows the one browser prompt.
  }
  if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') {
    return 'unsupported'
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return notificationPermission()
  }
}

/** Show a system notification. False when permission is missing or the call fails. */
export function showSystemNotification(input: {
  title: string
  body: string
  noteId: string
  onClick: () => void
}): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  try {
    const notification = new Notification(input.title, {
      body: input.body,
      tag: input.noteId,
      data: { noteId: input.noteId },
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
      input.onClick()
    }
    return true
  } catch {
    return false
  }
}
