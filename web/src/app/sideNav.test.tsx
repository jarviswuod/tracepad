import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { openTracepadDb, type TracepadDatabase } from '../data/db'
import { SideNamesProvider } from '../ui/sideNames'
import { AppHeader } from './AppShell'
import { AppRoutes } from './AppRoutes'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-side-nav-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

async function renderHome(db: TracepadDatabase) {
  render(
    <MemoryRouter initialEntries={['/home']}>
      <SideNamesProvider>
        <AppHeader />
        <AppRoutes db={db} />
      </SideNamesProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

describe('side navigation', () => {
  it('names the top bar after the open view, and keeps Tracepad on Notes', async () => {
    const db = await open()
    await db.put('labels', {
      id: 'todo',
      userId: null,
      name: '6 mths daily coding TODO',
      updatedAt: '2026-11-24T12:00:00.000Z',
    })
    await renderHome(db)

    const heading = () => screen.getByRole('heading', { level: 1 })
    expect(heading()).toHaveAccessibleName('Tracepad')
    expect(heading().querySelector('.brand-bulb')).not.toBeNull()

    const nav = screen.getByRole('navigation', { name: 'Views' })
    expect(within(nav).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Notes' }).querySelector('.side-link-name')).toHaveTextContent(
      'Notes',
    )

    fireEvent.click(within(nav).getByRole('button', { name: 'Trash' }))
    await waitFor(() => expect(heading()).toHaveAccessibleName('Trash'))
    expect(heading().querySelector('.brand-bulb')).toBeNull()
    expect(within(nav).getByRole('button', { name: 'Trash' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Notes' })).not.toHaveAttribute('aria-current')

    fireEvent.click(within(nav).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(heading()).toHaveAccessibleName('Archive'))

    fireEvent.click(within(nav).getByRole('button', { name: 'Reminders' }))
    await waitFor(() => expect(heading()).toHaveAccessibleName('Reminders'))

    fireEvent.click(within(nav).getByRole('button', { name: '6 mths daily coding TODO' }))
    await waitFor(() => expect(heading()).toHaveAccessibleName('6 mths daily coding TODO'))
    expect(within(nav).getByRole('button', { name: '6 mths daily coding TODO' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(within(nav).getByRole('button', { name: 'Notes' }))
    await waitFor(() => expect(heading()).toHaveAccessibleName('Tracepad'))
    expect(heading().querySelector('.brand-bulb')).not.toBeNull()
  })

  it('hides side names from the main menu and leaves every other button icon-only', async () => {
    const db = await open()
    await db.put('labels', {
      id: 'work',
      userId: null,
      name: 'Work',
      updatedAt: '2026-11-24T12:00:00.000Z',
    })
    await renderHome(db)

    const menu = screen.getByRole('button', { name: 'Main menu' })
    expect(menu).toHaveAttribute('title', 'Main menu')
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(menu.querySelector('svg')).not.toBeNull()
    expect(menu.textContent?.trim() ?? '').toBe('')

    const nav = screen.getByRole('navigation', { name: 'Views' })
    const notes = within(nav).getByRole('button', { name: 'Notes' })
    const work = within(nav).getByRole('button', { name: 'Work' })
    const edit = within(nav).getByRole('button', { name: 'Edit labels' })
    expect(notes.querySelector('.side-link-name')).toHaveTextContent('Notes')
    expect(work.querySelector('.side-link-name')).toHaveTextContent('Work')
    expect(edit.querySelector('.side-link-name')).toHaveTextContent('Edit labels')
    expect(screen.getByRole('button', { name: 'Grid' }).textContent?.trim() ?? '').toBe('')
    expect(screen.getByRole('button', { name: 'List' }).textContent?.trim() ?? '').toBe('')

    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(nav).toHaveClass('is-collapsed')
    expect(notes.querySelector('.side-link-name')).toBeNull()
    expect(work.querySelector('.side-link-name')).toBeNull()
    expect(edit.querySelector('.side-link-name')).toBeNull()
    expect(notes).toHaveAccessibleName('Notes')
    expect(work).toHaveAccessibleName('Work')
    expect(notes.querySelector('svg')).not.toBeNull()
    expect(notes).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Grid' }).textContent?.trim() ?? '').toBe('')

    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(nav).not.toHaveClass('is-collapsed')
    expect(notes.querySelector('.side-link-name')).toHaveTextContent('Notes')
    expect(work.querySelector('.side-link-name')).toHaveTextContent('Work')
  })
})
